import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-103-prelaunch-traffic-attestation.cjs', import.meta.url),
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const releaseDoc = readFileSync(
  new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-103-prelaunch-traffic-attestation.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

const confirmationArgs = [
  '--mode=preflight',
  '--target=staging',
  '--migration=confirmed',
  '--proxy-client-ip=confirmed',
  '--rate-limit=confirmed',
  '--privacy-mailbox=confirmed',
  '--public-qa=confirmed',
  '--pr-gate=confirmed',
  '--privacy-copy=confirmed',
]
const separatedConfirmationArgs = confirmationArgs.flatMap((argument) => {
  const separatorIndex = argument.indexOf('=')
  return [argument.slice(0, separatorIndex), argument.slice(separatorIndex + 1)]
})

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('ISSUE-103 prelaunch traffic attestation', () => {
  it('passes the read-only and redacted contract gate', () => {
    const result = run(['--mode=contract'])
    const payload = JSON.parse(result.stdout) as {
      issue: string
      mode: string
      result: string
      evidence_policy: string
      checks: string[]
    }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({
      issue: 'ISSUE-103',
      mode: 'contract',
      result: 'pass',
    })
    expect(payload.evidence_policy).toContain('no secret values')
    expect(payload.checks).toEqual(
      expect.arrayContaining([
        'read-only-policy',
        'redacted-output-policy',
        'required-environment-presence-only',
        'human-attestation-required',
        'hold-by-default',
        'pr-gate-integration',
      ]),
    )
  })

  it('holds when environment presence or human attestations are missing', () => {
    const result = run(['--mode=preflight', '--target=production'], {
      WAITLIST_EMAIL_HASH_PEPPER: '',
      DATABASE_URL: '',
      DIRECT_URL: '',
    })
    const payload = JSON.parse(result.stdout) as {
      result: string
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'waitlist-email-hash-pepper',
      kind: 'presence',
      status: 'hold',
    })
    expect(payload.checks).toContainEqual({
      id: 'waitlist-migration-applied',
      kind: 'human-attestation',
      status: 'hold',
    })
  })

  it('returns go only when every presence check and attestation passes', () => {
    const sensitiveValues = {
      WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
    }
    const result = run(confirmationArgs, sensitiveValues)
    const payload = JSON.parse(result.stdout) as {
      result: string
      target: string
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(0)
    expect(payload.result).toBe('go')
    expect(payload.target).toBe('staging')
    expect(payload.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(result.stdout).not.toContain(sensitiveValues.WAITLIST_EMAIL_HASH_PEPPER)
    expect(result.stdout).not.toContain(sensitiveValues.DATABASE_URL)
    expect(result.stdout).not.toContain(sensitiveValues.DIRECT_URL)
  })

  it('supports separated CLI values without falling back to contract mode', () => {
    const result = run(separatedConfirmationArgs, {
      WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
    })
    const payload = JSON.parse(result.stdout) as {
      mode: string
      result: string
      target: string
    }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({
      mode: 'preflight',
      result: 'go',
      target: 'staging',
    })
  })

  it('redacts an unsupported mode instead of echoing the input', () => {
    const unsupportedMode = 'postgresql://sentinel-secret-value'
    const result = run([`--mode=${unsupportedMode}`])
    const payload = JSON.parse(result.stdout) as {
      mode: string
      result: string
      reason: string
    }

    expect(result.status).toBe(1)
    expect(payload).toMatchObject({
      mode: 'unsupported',
      result: 'fail',
      reason: 'unsupported_mode',
    })
    expect(result.stdout).not.toContain(unsupportedMode)
  })

  it('documents the operational boundary and current issue state', () => {
    expect(packageSource).toContain('qa:issue103:prelaunch-traffic')
    expect(packageSource).toContain('pnpm qa:issue103:prelaunch-traffic -- --mode=contract')
    expect(releaseDoc).toContain('--mode=preflight')
    expect(releaseDoc).toContain('外部状態を自動確認したことにはならない')
    expect(issueSource).toContain('github_issue: 230')
    expect(issueSource).toContain('status: review')
    expect(issueIndexSource).toContain(
      '## Review Queue\n\n- `ISSUE-103` / `#230`: PR 作成 / review / merge 待ち。',
    )
  })
})
