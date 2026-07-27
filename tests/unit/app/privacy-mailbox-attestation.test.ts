import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-109-privacy-mailbox-attestation.cjs', import.meta.url),
)
const scriptSource = readFileSync(scriptPath, 'utf8')
const require = createRequire(import.meta.url)
const { assertReadOnlySource } = require(scriptPath) as {
  assertReadOnlySource: (sourceText: string) => void
}
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-109-privacy-mailbox-attestation.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const releaseDoc = readFileSync(
  new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)

const confirmationArgs = [
  '--mode=attest',
  '--receiving=confirmed',
  '--access-control=confirmed',
  '--guidance-stop=confirmed',
  '--registration-deletion=confirmed',
]
const permissionReadPaths = [
  scriptPath,
  fileURLToPath(
    new URL('../../../scripts/qa/issue-103-prelaunch-traffic-attestation.cjs', import.meta.url),
  ),
  fileURLToPath(new URL('../../../package.json', import.meta.url)),
  fileURLToPath(new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url)),
  fileURLToPath(
    new URL('../../../docs/issues/ISSUE-109-privacy-mailbox-attestation.md', import.meta.url),
  ),
  fileURLToPath(
    new URL('../../../docs/issues/ISSUE-105-staging-preflight-go-hold.md', import.meta.url),
  ),
  fileURLToPath(new URL('../../../docs/issues/README.md', import.meta.url)),
  fileURLToPath(new URL('../../../node_modules/', import.meta.url)),
]
const permissionArgs = [
  '--permission',
  ...permissionReadPaths.map((path) => `--allow-fs-read=${path}`),
]

function run(args: string[]) {
  return spawnSync(process.execPath, [...permissionArgs, scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  })
}

function runWithoutPermissions(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  })
}

function runOutsideRepo(args: string[]) {
  const outsideRepoRoot = fileURLToPath(new URL('../../../tests', import.meta.url))
  const missingContractScript = `${outsideRepoRoot}/scripts/qa/issue-109-privacy-mailbox-attestation.cjs`
  return spawnSync(
    process.execPath,
    [...permissionArgs, `--allow-fs-read=${missingContractScript}`, scriptPath, ...args],
    {
      cwd: outsideRepoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  )
}

describe('ISSUE-109 privacy mailbox attestation', () => {
  it('passes the read-only and status-only contract mode', () => {
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
      issue: 'ISSUE-109',
      mode: 'contract',
      result: 'pass',
    })
    expect(payload.evidence_policy).toContain('no operator identity')
    expect(Object.keys(payload).sort()).toEqual(
      ['checks', 'evidence_policy', 'issue', 'mode', 'result'].sort(),
    )
    expect(payload.checks).toEqual(
      expect.arrayContaining([
        'mailbox-receiving-attestation',
        'mailbox-access-control-attestation',
        'guidance-stop-operation-attestation',
        'registration-deletion-operation-attestation',
        'sensitive-input-redaction',
        'hold-by-default',
        'pr-gate-integration',
      ]),
    )
  })

  it('holds when every operational confirmation is missing', () => {
    const result = run(['--mode=attest'])
    const payload = JSON.parse(result.stdout) as {
      result: string
      checks: Array<{ id: string; kind: string; status: string }>
    }

    expect(result.status).toBe(1)
    expect(payload.result).toBe('hold')
    expect(payload.checks).toHaveLength(4)
    expect(payload.checks.every((check) => check.status === 'hold')).toBe(true)
    expect(payload.checks.every((check) => check.kind === 'human-attestation')).toBe(true)
  })

  it('holds when the Node permission boundary is not enabled', () => {
    const result = runWithoutPermissions(confirmationArgs)

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      issue: 'ISSUE-109',
      mode: 'restricted-runtime',
      result: 'hold',
      evidence: 'redacted-runtime-policy',
      reason: 'restricted_runtime_required',
    })
  })

  it('denies repository files outside the explicit read allowlist', () => {
    const result = spawnSync(
      process.execPath,
      [...permissionArgs, '-e', "require('node:fs').readFileSync('.env', 'utf8')"],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ERR_ACCESS_DENIED')
  })

  it.each([
    ['--receiving', 'mailbox-receiving-confirmed'],
    ['--access-control', 'mailbox-access-control-confirmed'],
    ['--guidance-stop', 'guidance-stop-operation-confirmed'],
    ['--registration-deletion', 'registration-deletion-operation-confirmed'],
  ])('holds when %s is the only missing confirmation', (missingArgument, checkId) => {
    const result = run(confirmationArgs.filter((argument) => !argument.startsWith(missingArgument)))
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

  it('returns go only when all four operational confirmations pass', () => {
    const result = run(confirmationArgs)
    const payload = JSON.parse(result.stdout) as {
      result: string
      scope: string
      attestation_version: string
      attested_at: string
      checks: Array<{ status: string }>
    }

    expect(result.status).toBe(0)
    expect(payload.result).toBe('go')
    expect(payload.scope).toBe('prelaunch')
    expect(payload.attestation_version).toBe('prelaunch-mailbox-v1')
    expect(payload.attested_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(payload.checks.every((check) => check.status === 'pass')).toBe(true)
  })

  it('does not echo operator identity, email address, or message content', () => {
    const sensitiveValues = [
      'operator-name-sentinel',
      'requester-sentinel@example.test',
      'private-message-body-sentinel',
      'deletion-request-id-sentinel',
    ]
    const result = run([
      '--mode=attest',
      `--receiving=${sensitiveValues[0]}`,
      `--access-control=${sensitiveValues[1]}`,
      `--guidance-stop=${sensitiveValues[2]}`,
      `--registration-deletion=${sensitiveValues[3]}`,
    ])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'hold' })
    for (const sensitiveValue of sensitiveValues) {
      expect(output).not.toContain(sensitiveValue)
    }
  })

  it('supports separated confirmed values', () => {
    const separatedArgs = confirmationArgs.flatMap((argument) => {
      const separatorIndex = argument.indexOf('=')
      return [argument.slice(0, separatorIndex), argument.slice(separatorIndex + 1)]
    })
    const result = run(separatedArgs)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'attest',
      result: 'go',
    })
  })

  it.each([
    ['duplicate option', [...confirmationArgs, '--receiving=revoked']],
    ['unknown option', [...confirmationArgs, '--operator-name=private-sentinel']],
    ['positional value', [...confirmationArgs, 'private-sentinel']],
    ['missing option value', ['--mode=attest', '--receiving']],
    ['contract option pollution', ['--mode=contract', '--receiving=confirmed']],
  ])('holds and redacts invalid arguments: %s', (_label, args) => {
    const result = run(args)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      issue: 'ISSUE-109',
      mode: 'invalid',
      result: 'hold',
      evidence: 'redacted-invalid-arguments',
      reason: 'invalid_arguments',
    })
    expect(output).not.toContain('private-sentinel')
    expect(output).not.toContain('revoked')
  })

  it.each([
    [
      'forbidden fs binding',
      "const { unlinkSync } = require('node:fs')\nunlinkSync('private-path')",
    ],
    ['network import', "const http = require('node:http')\nhttp.request('private-host')"],
    ['computed global access', "global[['fetch'].join('')]('https://private-host')"],
    ['constructor escape', "readFileSync.constructor('return process')()"],
    ['computed constructor escape', "readFileSync['con' + 'structor']('return process')()"],
    [
      'process alias escape',
      "const runtime = process\nconst fs = runtime.getBuiltinModule('node:fs')\nfs[['write', 'FileSync'].join('')]('private-path', 'x')",
    ],
    ['typescript delete escape', "ts.sys.deleteFile('private-path')"],
    ['typescript directory escape', "ts.sys.createDirectory('private-path')"],
    [
      'repository read to stdout',
      "const privateData = readFileSync('.env', 'utf8')\nprocess.stdout.write(privateData)",
    ],
    ['console output', "console.log(readFileSync('.env', 'utf8'))"],
  ])('rejects a read-only contract mutation: %s', (_label, mutation) => {
    expect(() => assertReadOnlySource(`${scriptSource}\n${mutation}\n`)).toThrow(/read-only-policy/)
  })

  it('redacts unsupported mode input', () => {
    const unsupportedMode = 'private-message-body-sentinel'
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
  })

  it('records the operational boundary and current review state', () => {
    expect(packageSource).toContain('qa:issue109:privacy-mailbox')
    expect(packageSource).toContain('pnpm qa:issue109:privacy-mailbox -- --mode=contract')
    expect(releaseDoc).toContain('Privacy Mailbox Attestation')
    expect(releaseDoc).toContain('担当者名、実メール、問い合わせ本文')
    expect(issueSource).toContain('github_issue: 237')
    expect(issueSource).toContain('status: review')
    expect(issueIndexSource).toContain('`ISSUE-109` / `#237`: PR 作成 / review / merge 待ち。')
  })
})
