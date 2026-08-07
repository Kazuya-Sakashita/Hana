import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = new URL('../../..', import.meta.url)
const rootPath = fileURLToPath(root)
const candidateConfigUrl = new URL('scripts/loop-engineer/candidate-prisma.config.ts', root).href
const trustedPostgresModule = '../../../scripts/loop-engineer/trusted-synthetic-postgres.mjs'
const trustedPostgres = import(trustedPostgresModule) as Promise<{
  checkedSyntheticPostgresUrl: (
    value: string | undefined,
    expectedUser: string,
    expectedPassword: string,
    expectedPort?: string,
  ) => string
}>

function createArtifactWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'hana-issue184-artifact-'))
  const prismaRoot = join(workspace, 'candidate', 'prisma')
  mkdirSync(join(prismaRoot, 'migrations', 'synthetic'), { recursive: true })
  writeFileSync(join(prismaRoot, 'schema.prisma'), 'datasource db { provider = "postgresql" }\n')
  writeFileSync(join(prismaRoot, 'migrations', 'synthetic', 'migration.sql'), 'SELECT 1;\n')
  return workspace
}

function runCandidateConfig(workspace: string) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(candidateConfigUrl)})`,
    ],
    {
      cwd: rootPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_WORKSPACE: workspace,
        HANA_CANDIDATE_ROOT: join(workspace, 'candidate'),
        DIRECT_URL: 'postgresql://postgres:synthetic-schema-owner@localhost:5432/hana_ci',
      },
    },
  )
}

function withArtifactWorkspace(operation: (workspace: string) => void): void {
  const workspace = createArtifactWorkspace()
  try {
    operation(workspace)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

describe('ISSUE-184 trusted database evidence boundary', () => {
  it('accepts only the exact synthetic PostgreSQL target and credentials', async () => {
    const { checkedSyntheticPostgresUrl } = await trustedPostgres
    expect(
      checkedSyntheticPostgresUrl(
        'postgresql://hana_admin:hana-admin@localhost:5432/hana_ci',
        'hana_admin',
        'hana-admin',
      ),
    ).toBe('postgresql://hana_admin:hana-admin@localhost:5432/hana_ci')
    expect(
      checkedSyntheticPostgresUrl(
        'postgresql://hana_admin:hana-admin@127.0.0.1:55484/hana_ci',
        'hana_admin',
        'hana-admin',
        '55484',
      ),
    ).toBe('postgresql://hana_admin:hana-admin@127.0.0.1:55484/hana_ci')
  })

  it.each([
    undefined,
    '',
    'postgresql://hana_admin:hana-admin@database.example.com:5432/hana_ci',
    'postgresql://hana_admin:hana-admin@localhost:5433/hana_ci',
    'postgresql://hana_admin:hana-admin@localhost:5432/production',
    'postgresql://other:hana-admin@localhost:5432/hana_ci',
    'postgresql://hana_admin:other@localhost:5432/hana_ci',
    'postgresql://hana_admin:hana-admin@localhost:5432/hana_ci?sslmode=require',
    'postgresql://hana_admin:hana-admin@localhost:5432/hana_ci#fragment',
  ])('rejects a non-synthetic database target %#', async (value) => {
    const { checkedSyntheticPostgresUrl } = await trustedPostgres
    expect(() => checkedSyntheticPostgresUrl(value, 'hana_admin', 'hana-admin')).toThrow()
  })

  it('keeps the migration runner on trusted dependencies and candidate artifacts only', () => {
    const workflow = readFileSync(
      new URL('.github/workflows/loop-engineer-merge-gates.yml', root),
      'utf8',
    )
    const config = readFileSync(
      new URL('scripts/loop-engineer/candidate-prisma.config.ts', root),
      'utf8',
    )

    expect(workflow).toContain(
      'pnpm --dir trusted-control install --frozen-lockfile --ignore-scripts',
    )
    expect(workflow).toContain('candidate/pnpm-lock.yaml')
    expect(workflow).toContain('HANA_CANDIDATE_ROOT: ${{ github.workspace }}/candidate')
    expect(workflow).toContain('pnpm --dir trusted-control exec prisma migrate deploy')
    expect(workflow).toContain(
      'node trusted-control/scripts/loop-engineer/test-child-rls-evidence-fail-closed.mjs',
    )
    expect(workflow).not.toContain('run: pnpm qa:issue151:')
    expect(workflow).not.toContain('run: pnpm db:migrate:deploy')
    expect(config).toContain("resolve(githubWorkspace, 'candidate')")
    expect(config).toContain("'prisma/schema.prisma'")
    expect(config).toContain("'prisma/migrations'")
    expect(config).toContain('stat.isSymbolicLink()')
    expect(config).not.toContain('prisma.config.ts')
  })

  it('accepts a regular candidate schema and migration tree', () => {
    withArtifactWorkspace((workspace) => {
      expect(runCandidateConfig(workspace).status).toBe(0)
    })
  })

  it('rejects a symlinked prisma parent', () => {
    withArtifactWorkspace((workspace) => {
      const candidate = join(workspace, 'candidate')
      const prisma = join(candidate, 'prisma')
      const alternate = join(candidate, 'alternate-prisma')
      rmSync(prisma, { recursive: true })
      mkdirSync(join(alternate, 'migrations'), { recursive: true })
      writeFileSync(join(alternate, 'schema.prisma'), 'datasource db { provider = "postgresql" }\n')
      symlinkSync('alternate-prisma', prisma, 'dir')

      expect(runCandidateConfig(workspace).status).not.toBe(0)
    })
  })

  it('rejects a symlinked schema leaf', () => {
    withArtifactWorkspace((workspace) => {
      const candidate = join(workspace, 'candidate')
      const schema = join(candidate, 'prisma', 'schema.prisma')
      rmSync(schema)
      writeFileSync(
        join(candidate, 'alternate-schema.prisma'),
        'datasource db { provider = "postgresql" }\n',
      )
      symlinkSync('../alternate-schema.prisma', schema)

      expect(runCandidateConfig(workspace).status).not.toBe(0)
    })
  })

  it('rejects a migration symlink outside the candidate checkout', () => {
    withArtifactWorkspace((workspace) => {
      const migrations = join(workspace, 'candidate', 'prisma', 'migrations')
      const outside = join(workspace, 'outside-migrations')
      rmSync(migrations, { recursive: true })
      mkdirSync(outside)
      writeFileSync(join(outside, 'migration.sql'), 'SELECT 1;\n')
      symlinkSync(outside, migrations, 'dir')

      expect(runCandidateConfig(workspace).status).not.toBe(0)
    })
  })

  it('rejects missing candidate artifacts', () => {
    withArtifactWorkspace((workspace) => {
      rmSync(join(workspace, 'candidate', 'prisma', 'schema.prisma'))
      expect(runCandidateConfig(workspace).status).not.toBe(0)
    })
  })

  it('verifies exact policy, privileges, role graph, and random owner CRUD', () => {
    const verifier = readFileSync(
      new URL('scripts/loop-engineer/verify-child-rls-evidence.mjs', root),
      'utf8',
    )
    const adversarial = readFileSync(
      new URL('scripts/loop-engineer/test-child-rls-evidence-fail-closed.mjs', root),
      'utf8',
    )

    expect(verifier).toContain('ownerMembershipCountExact')
    expect(verifier).toContain('const roleCatalog')
    expect(verifier).toContain('const roleMemberships')
    expect(verifier).toContain("role.rolname NOT IN ('hana_admin', 'postgres')")
    expect(verifier).toContain('schemaOwnerMembershipExact')
    expect(verifier).toContain('ownerHasNoParentRole')
    expect(verifier).toContain('ownerCannotSetOtherRole')
    expect(verifier).toContain('runtimeInsertDenied')
    expect(verifier).toContain('ownerInsertGranted')
    expect(verifier).toContain('requireExactFunctionAcl')
    expect(verifier).toContain('unexpectedDefinerExposureAbsent')
    expect(verifier).toContain('unexpectedRelationAccessAbsent')
    expect(verifier).toContain('const defaultAcl')
    expect(verifier).toContain('derivedRelations')
    expect(verifier).toContain('trusted_child_rls_owner_write_not_persisted')
    expect(verifier).toContain("using: '(user_id = public.hana_current_user_id())'")
    expect(verifier).toContain('requireDirectRuntimeDenied')
    expect(verifier).toContain('updated_at')
    expect(verifier).toContain('HANA_SYNTHETIC_POSTGRES_PORT')
    expect(adversarial).toContain('WITH CHECK (false)')
    expect(adversarial).toContain("LOGIN PASSWORD 'synthetic-backdoor'")
    expect(adversarial).toContain('role.rolbypassrls')
    expect(adversarial).toContain('FOR INSERT TO hana_child_runtime WITH CHECK (true)')
    expect(adversarial).toContain('TO authenticated')
    expect(adversarial).toContain('SECURITY DEFINER')
    expect(adversarial).toContain('CREATE VIEW public.${exposedView}')
    expect(adversarial).toContain('CREATE VIEW ${viewSchema}.${viewName}')
    expect(adversarial).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public')
    expect(adversarial).toContain('TO hana_child_owner WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  })
})
