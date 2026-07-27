import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-106-staging-target-contract.cjs', import.meta.url),
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-106-staging-target-contract.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function runOutsideRepo(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: fileURLToPath(new URL('../../../tests', import.meta.url)),
    encoding: 'utf8',
    env: process.env,
  })
}

describe('ISSUE-106 staging target contract', () => {
  it('passes the read-only contract mode', () => {
    const result = run(['--mode=contract'])
    const payload = JSON.parse(result.stdout) as {
      issue: string
      mode: string
      result: string
      evidence_policy: string
    }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({
      issue: 'ISSUE-106',
      mode: 'contract',
      result: 'pass',
    })
    expect(payload.evidence_policy).toContain('no target URL')
    expect(packageSource).toContain('qa:issue106:staging-target')
  })

  it('holds when target values are missing', () => {
    const result = run(['--mode=preflight'], {
      STAGING_HOSTING_PLATFORM: '',
      STAGING_BASE_URL: '',
    })
    const payload = JSON.parse(result.stdout) as {
      result: string
      checks: Array<{ id: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.checks.every((check) => check.status === 'hold')).toBe(true)
  })

  it.each([
    'http://staging.example.com',
    'https:staging.example.com',
    'https://localhost:3000',
    'https://localhost.',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://172.16.0.1',
    'https://192.168.1.1',
    'https://169.254.169.254',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://staging.internal',
    'https://service.local.',
    'https://staging',
    'https://localhost..',
    'https://service.local..',
    'https://staging.example.test',
    'https://foo.invalid',
    'https://foo.example',
    'https://foo.onion',
    'https://service.home.arpa',
    'https://foo..example.com',
    'https://.example.com',
    'https://foo_bar.example.com',
    'https://@staging.example.com',
    'https://:@staging.example.com',
    'https://user:password@staging.example.com',
    'https://staging.example.com:8443',
    'https://staging.example.com/lp',
    'https://staging.example.com\\private',
    'https://staging.example.com/%2e%2e/lp',
    'https://staging.example.com?',
    'https://staging.example.com?token=x',
    'https://staging.example.com#',
    'https://staging.example.com#fragment',
    'not-a-url',
  ])('holds for unsafe staging URL shape: %s', (baseUrl) => {
    const result = run(['--mode=preflight'], {
      STAGING_HOSTING_PLATFORM: 'test-platform',
      STAGING_BASE_URL: baseUrl,
    })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'hold' })
    expect(result.stdout).not.toContain(baseUrl)
  })

  it('returns go for a public HTTPS origin without emitting target values', () => {
    const platform = 'test-platform-sentinel'
    const baseUrl = 'https://staging.example.com'
    const result = run(['--mode=preflight'], {
      STAGING_HOSTING_PLATFORM: platform,
      STAGING_BASE_URL: baseUrl,
    })
    const payload = JSON.parse(result.stdout) as { result: string; target: string }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({ result: 'go', target: 'staging' })
    expect(result.stdout).not.toContain(platform)
    expect(result.stdout).not.toContain(baseUrl)
    expect(result.stdout).not.toContain('staging.example.com')
    expect(result.stderr).not.toContain(platform)
    expect(result.stderr).not.toContain(baseUrl)
    expect(result.stderr).not.toContain('staging.example.com')
  })

  it.each(['HTTPS://STAGING.EXAMPLE.COM', 'https://staging.example.com:443'])(
    'accepts a normalized public HTTPS origin: %s',
    (baseUrl) => {
      const result = run(['--mode=preflight'], {
        STAGING_HOSTING_PLATFORM: 'test-platform',
        STAGING_BASE_URL: baseUrl,
      })

      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ result: 'go' })
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(baseUrl)
    },
  )

  it('does not emit credential, host, or platform fragments for an unsafe URL', () => {
    const platform = 'platform-sentinel'
    const username = 'username-sentinel'
    const password = 'password-sentinel'
    const hostname = 'private-host-sentinel.example.com'
    const baseUrl = `https://${username}:${password}@${hostname}/private-path`
    const result = run(['--mode=preflight'], {
      STAGING_HOSTING_PLATFORM: platform,
      STAGING_BASE_URL: baseUrl,
    })
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'hold' })
    for (const sensitiveValue of [platform, username, password, hostname, baseUrl]) {
      expect(output).not.toContain(sensitiveValue)
    }
  })

  it('redacts unsupported mode input', () => {
    const unsupportedMode = 'https://secret-host.example.test'
    const result = run([`--mode=${unsupportedMode}`])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'unsupported',
      result: 'fail',
      reason: 'unsupported_mode',
    })
    expect(result.stdout).not.toContain(unsupportedMode)
  })

  it('normalizes unexpected contract failures without emitting filesystem paths', () => {
    const result = runOutsideRepo(['--mode=contract'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'contract',
      result: 'fail',
      reason: 'contract_check_failed',
    })
    expect(output).not.toContain(repoRoot)
    expect(output).not.toContain('/tests/scripts/qa')
  })

  it('records the issue in review under ISSUE-105', () => {
    expect(issueSource).toContain('github_issue: 236')
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('parent: ISSUE-105')
    expect(issueIndexSource).toContain('`ISSUE-106` / `#236`: PR 作成 / review / merge 待ち。')
  })
})
