import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const root = new URL('../../..', import.meta.url)
const trustedPostgresModule = '../../../scripts/loop-engineer/trusted-synthetic-postgres.mjs'
const trustedPostgres = import(trustedPostgresModule) as Promise<{
  checkedSyntheticPostgresUrl: (
    value: string | undefined,
    expectedUser: string,
    expectedPassword: string,
    expectedPort?: string,
  ) => string
}>

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
    expect(workflow).not.toContain('run: pnpm qa:issue151:')
    expect(workflow).not.toContain('run: pnpm db:migrate:deploy')
    expect(config).toContain("resolve(githubWorkspace, 'candidate')")
    expect(config).toContain("'prisma/schema.prisma'")
    expect(config).toContain("'prisma/migrations'")
    expect(config).toContain('stat.isSymbolicLink()')
    expect(config).not.toContain('prisma.config.ts')
  })

  it('verifies exact schema-owner membership and complete synthetic timestamps', () => {
    const verifier = readFileSync(
      new URL('scripts/loop-engineer/verify-child-rls-evidence.mjs', root),
      'utf8',
    )

    expect(verifier).toContain('ownerMembershipCountExact')
    expect(verifier).toContain('schemaOwnerMembershipExact')
    expect(verifier).toContain('updated_at')
    expect(verifier).toContain('HANA_SYNTHETIC_POSTGRES_PORT')
  })
})
