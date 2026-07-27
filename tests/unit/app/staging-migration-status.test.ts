import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const normalizedRepoRoot = repoRoot.replace(/\/$/, '')
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-107-staging-migration-status.cjs', import.meta.url),
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const releaseDoc = readFileSync(
  new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-107-staging-migration-status.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const {
  normalizeMigrateStatus,
  prismaEnvironment,
  prismaStatusArguments,
  runStatus,
}: {
  normalizeMigrateStatus: (execution: {
    status: number | null
    error?: Error
    signal?: string | null
  }) => 'pass' | 'hold'
  prismaEnvironment: (environment: Record<string, string | undefined>) => Record<string, string>
  prismaStatusArguments: readonly string[]
  runStatus: (options?: {
    environment?: Record<string, string | undefined>
    execute?: typeof spawnSync
    prismaCliPath?: string
    resolvePrismaCli?: () => string
    target?: string
  }) => {
    result: 'pass' | 'hold'
    checks: Array<{ id: string; status: 'pass' | 'hold' }>
  }
} = require(scriptPath)

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('ISSUE-107 staging migration status', () => {
  it('passes contract mode without requiring a database URL', () => {
    const sentinel = 'postgresql://secret:secret@private.example.com:5432/hana'
    const result = run(['--mode=contract'], { DIRECT_URL: sentinel })
    const payload = JSON.parse(result.stdout) as {
      issue: string
      mode: string
      result: string
      checks: string[]
    }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({
      issue: 'ISSUE-107',
      mode: 'contract',
      result: 'pass',
    })
    expect(payload.checks).toContain('contract-mode-no-external-process')
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(sentinel)
  })

  it('holds without executing Prisma when DIRECT_URL is missing', () => {
    const execute = vi.fn()
    const payload = runStatus({
      environment: { DIRECT_URL: '' },
      execute: execute as unknown as typeof spawnSync,
      prismaCliPath: '/private/prisma-cli-sentinel',
      target: 'staging',
    })

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'direct-url',
      kind: 'presence',
      status: 'hold',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('holds without executing Prisma when staging target is not attested', () => {
    const execute = vi.fn()
    const payload = runStatus({
      environment: {
        DIRECT_URL: 'postgresql://secret:secret@private.example.com:5432/hana',
      },
      execute: execute as unknown as typeof spawnSync,
      prismaCliPath: '/private/prisma-cli-sentinel',
      target: 'production',
    })

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'target-environment',
      kind: 'operator-attestation',
      status: 'hold',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('executes only prisma migrate status and discards raw output', () => {
    const directUrl = 'postgresql://secret:secret@private.example.com:5432/hana'
    const rawStdout = 'raw-prisma-stdout-sentinel'
    const rawStderr = 'raw-prisma-stderr-sentinel'
    const execute = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: rawStdout,
      stderr: rawStderr,
    }))
    const payload = runStatus({
      environment: { DIRECT_URL: directUrl },
      execute: execute as unknown as typeof spawnSync,
      prismaCliPath: '/private/prisma-cli-sentinel',
      target: 'staging',
    })
    const serialized = JSON.stringify(payload)

    expect(payload.result).toBe('pass')
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      ['/private/prisma-cli-sentinel', ...prismaStatusArguments],
      expect.objectContaining({
        cwd: normalizedRepoRoot,
        env: expect.objectContaining({
          DIRECT_URL: directUrl,
          HANA_QA_SKIP_DOTENV: '1',
        }),
        stdio: 'ignore',
        timeout: 30_000,
        killSignal: 'SIGKILL',
      }),
    )
    for (const sensitiveValue of [directUrl, rawStdout, rawStderr, 'private.example.com']) {
      expect(serialized).not.toContain(sensitiveValue)
    }
  })

  it('passes only allowlisted environment values to Prisma', () => {
    const childEnvironment = prismaEnvironment({
      DIRECT_URL: 'postgresql://direct-url-sentinel',
      PATH: '/path-sentinel',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-sentinel',
      ANTHROPIC_API_KEY: 'anthropic-secret-sentinel',
    })
    const serialized = JSON.stringify(childEnvironment)

    expect(childEnvironment).toMatchObject({
      DIRECT_URL: 'postgresql://direct-url-sentinel',
      PATH: '/path-sentinel',
      HANA_QA_SKIP_DOTENV: '1',
      NO_COLOR: '1',
    })
    expect(serialized).not.toContain('service-role-secret-sentinel')
    expect(serialized).not.toContain('anthropic-secret-sentinel')
  })

  it('normalizes Prisma CLI resolution exceptions to a redacted hold', () => {
    const directUrl = 'postgresql://secret:secret@private.example.com:5432/hana'
    const resolverError = 'resolver-error-private-path-sentinel'
    const payload = runStatus({
      environment: { DIRECT_URL: directUrl },
      resolvePrismaCli: () => {
        throw new Error(resolverError)
      },
      target: 'staging',
    })
    const serialized = JSON.stringify(payload)

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'prisma-migrate-status',
      kind: 'read-only-command',
      status: 'hold',
    })
    for (const sensitiveValue of [directUrl, resolverError, 'private.example.com']) {
      expect(serialized).not.toContain(sensitiveValue)
    }
  })

  it.each([
    [{ status: 0, signal: null }, 'pass'],
    [{ status: 1, signal: null }, 'hold'],
    [{ status: null, signal: 'SIGTERM' }, 'hold'],
    [{ status: null, signal: null, error: new Error('timeout') }, 'hold'],
  ] as const)('normalizes execution %# to %s', (execution, expected) => {
    expect(normalizeMigrateStatus(execution)).toBe(expected)
  })

  it('redacts unsupported mode input', () => {
    const unsupportedMode = 'postgresql://secret-host.example.com/database'
    const result = run([`--mode=${unsupportedMode}`])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'unsupported',
      result: 'fail',
      reason: 'unsupported_mode',
    })
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(unsupportedMode)
  })

  it('records the implementation scope and review issue state', () => {
    expect(packageSource).toContain('qa:issue107:migration-status')
    expect(packageSource).toContain('pnpm qa:issue107:migration-status -- --mode=contract')
    expect(releaseDoc).toContain('Prisma の raw stdout / stderr は出力しない')
    expect(releaseDoc).toContain('--target=staging')
    expect(issueSource).toContain('github_issue: 238')
    expect(issueSource).toContain('status: review')
    expect(issueIndexSource).toContain('`ISSUE-107` / `#238`: PR 作成 / review / merge 待ち。')
  })
})
