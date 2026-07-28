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

const freshPrivacyAttestedAt = new Date().toISOString()
const confirmationArgs = [
  '--mode=preflight',
  '--target=staging',
  '--migration=confirmed',
  '--product-event-retention=confirmed',
  '--proxy-client-ip=confirmed',
  '--rate-limit=confirmed',
  '--privacy-mailbox-receiving=confirmed',
  '--privacy-mailbox-access-control=confirmed',
  '--privacy-guidance-stop=confirmed',
  '--privacy-registration-deletion=confirmed',
  '--privacy-attestation-scope=prelaunch',
  '--privacy-attestation-version=prelaunch-mailbox-v1',
  `--privacy-attested-at=${freshPrivacyAttestedAt}`,
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
    env: {
      ...process.env,
      PRODUCT_EVENT_HASH_PEPPER: 'test-product-event-pepper-with-32-bytes',
      ...env,
    },
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
        'required-environment-status-only',
        'trusted-proxy-exact-true',
        'human-attestation-required',
        'hold-by-default',
        'pr-gate-integration',
      ]),
    )
  })

  it('holds when environment presence or human attestations are missing', () => {
    const result = run(['--mode=preflight', '--target=production'], {
      WAITLIST_EMAIL_HASH_PEPPER: '',
      PRODUCT_EVENT_HASH_PEPPER: '',
      DATABASE_URL: '',
      DIRECT_URL: '',
      WAITLIST_TRUST_PROXY_HEADERS: 'false',
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
      id: 'product-event-hash-pepper',
      kind: 'minimum-length-32',
      status: 'hold',
    })
    expect(payload.checks).toContainEqual({
      id: 'waitlist-migration-applied',
      kind: 'human-attestation',
      status: 'hold',
    })
    expect(payload.checks).toContainEqual({
      id: 'trusted-proxy-headers-enabled',
      kind: 'exact-true',
      status: 'hold',
    })
  })

  it('returns go only when every environment check and attestation passes', () => {
    const sensitiveValues = {
      WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
      PRODUCT_EVENT_HASH_PEPPER: 'test-product-event-pepper-sentinel',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      WAITLIST_TRUST_PROXY_HEADERS: 'true',
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
    expect(payload).toMatchObject({
      privacy_attestation: {
        scope: 'prelaunch',
        version: 'prelaunch-mailbox-v1',
        attested_at: freshPrivacyAttestedAt,
      },
    })
    expect(payload.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(result.stdout).not.toContain(sensitiveValues.WAITLIST_EMAIL_HASH_PEPPER)
    expect(result.stdout).not.toContain(sensitiveValues.PRODUCT_EVENT_HASH_PEPPER)
    expect(result.stdout).not.toContain(sensitiveValues.DATABASE_URL)
    expect(result.stdout).not.toContain(sensitiveValues.DIRECT_URL)
  })

  it('holds until the product event retention job is confirmed', () => {
    const result = run(
      confirmationArgs.filter((argument) => !argument.startsWith('--product-event-retention=')),
      {
        WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        WAITLIST_TRUST_PROXY_HEADERS: 'true',
      },
    )
    const payload = JSON.parse(result.stdout) as {
      result: string
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'product-event-retention-scheduled',
      kind: 'human-attestation',
      status: 'hold',
    })
  })

  it.each([
    ['--privacy-mailbox-receiving', 'privacy-mailbox-receiving-confirmed'],
    ['--privacy-mailbox-access-control', 'privacy-mailbox-access-control-confirmed'],
    ['--privacy-guidance-stop', 'privacy-guidance-stop-confirmed'],
    ['--privacy-registration-deletion', 'privacy-registration-deletion-confirmed'],
  ])('holds when ISSUE-109 confirmation %s is missing', (missingArgument, checkId) => {
    const result = run(
      confirmationArgs.filter((argument) => !argument.startsWith(missingArgument)),
      {
        WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        WAITLIST_TRUST_PROXY_HEADERS: 'true',
      },
    )
    const payload = JSON.parse(result.stdout) as {
      result: string
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: checkId,
      kind: 'human-attestation',
      status: 'hold',
    })
  })

  it.each([
    '--privacy-mailbox-receiving',
    '--privacy-mailbox-access-control',
    '--privacy-guidance-stop',
    '--privacy-registration-deletion',
  ])('holds and redacts a duplicate ISSUE-109 confirmation: %s', (argumentName) => {
    const result = run([...confirmationArgs, `${argumentName}=revoked`], {
      WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      WAITLIST_TRUST_PROXY_HEADERS: 'true',
    })
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      issue: 'ISSUE-103',
      mode: 'invalid',
      result: 'hold',
      evidence: 'redacted-invalid-arguments',
      reason: 'invalid_arguments',
    })
    expect(output).not.toContain('revoked')
  })

  it.each([
    ['unknown option', [...confirmationArgs, '--operator-name=private-sentinel']],
    ['positional input', [...confirmationArgs, 'private-sentinel']],
    ['missing value', ['--mode=preflight', '--target']],
    ['contract option pollution', ['--mode=contract', '--target=staging']],
  ])('holds and redacts invalid preflight arguments: %s', (_label, args) => {
    const result = run(args)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'invalid',
      result: 'hold',
      reason: 'invalid_arguments',
    })
    expect(output).not.toContain('private-sentinel')
  })

  it('holds when the ISSUE-109 attestation is stale', () => {
    const staleTimestamp = '2020-01-01T00:00:00.000Z'
    const result = run(
      confirmationArgs.map((argument) =>
        argument.startsWith('--privacy-attested-at=')
          ? `--privacy-attested-at=${staleTimestamp}`
          : argument,
      ),
      {
        WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        WAITLIST_TRUST_PROXY_HEADERS: 'true',
      },
    )
    const payload = JSON.parse(result.stdout) as {
      result: string
      privacy_attestation: { attested_at: string }
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.privacy_attestation.attested_at).toBe('unconfirmed')
    expect(payload.checks).toContainEqual({
      id: 'privacy-attestation-freshness',
      kind: 'fresh-date-time',
      status: 'hold',
    })
    expect(result.stdout).not.toContain(staleTimestamp)
  })

  it('supports separated CLI values without falling back to contract mode', () => {
    const result = run(separatedConfirmationArgs, {
      WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
      WAITLIST_TRUST_PROXY_HEADERS: 'true',
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

  it.each(['false', 'TRUE', '1'])(
    'holds without revealing a non-exact trusted proxy setting: %s',
    (setting) => {
      const result = run(confirmationArgs, {
        WAITLIST_EMAIL_HASH_PEPPER: 'test-pepper-sentinel',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        DIRECT_URL: 'postgresql://test:test@127.0.0.1:5432/hana_test',
        WAITLIST_TRUST_PROXY_HEADERS: setting,
      })
      const payload = JSON.parse(result.stdout) as {
        result: string
        checks: Array<{ id: string; status: string }>
      }

      expect(result.status).toBe(1)
      expect(payload.result).toBe('hold')
      expect(payload.checks).toContainEqual({
        id: 'trusted-proxy-headers-enabled',
        kind: 'exact-true',
        status: 'hold',
      })
      expect(result.stdout).not.toContain(`"${setting}"`)
    },
  )

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
    expect(issueSource).toContain('status: done')
    expect(issueIndexSource).toContain(
      'prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`, `ISSUE-095`, `ISSUE-097`, `ISSUE-099`, `ISSUE-101`, `ISSUE-103`',
    )
    expect(issueIndexSource).toContain(
      '`ISSUE-088`, `ISSUE-090`, `ISSUE-092`, `ISSUE-094`, `ISSUE-096`, `ISSUE-098`, `ISSUE-100`, `ISSUE-102`, `ISSUE-104`',
    )
  })
})
