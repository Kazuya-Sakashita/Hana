const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const issue = 'ISSUE-103'
const requestedMode = argValue('--mode', 'contract')
const mode = ['contract', 'preflight'].includes(requestedMode) ? requestedMode : 'unsupported'
const repoRoot = process.cwd()

const files = {
  script: 'scripts/qa/issue-103-prelaunch-traffic-attestation.cjs',
  packageJson: 'package.json',
  envExample: '.env.example',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  issueDoc: 'docs/issues/ISSUE-103-prelaunch-traffic-attestation.md',
}

const requiredEnvironment = [
  { id: 'waitlist-email-hash-pepper', name: 'WAITLIST_EMAIL_HASH_PEPPER', kind: 'presence' },
  { id: 'database-url', name: 'DATABASE_URL', kind: 'presence' },
  { id: 'direct-url', name: 'DIRECT_URL', kind: 'presence' },
  {
    id: 'trusted-proxy-headers-enabled',
    name: 'WAITLIST_TRUST_PROXY_HEADERS',
    kind: 'exact-true',
  },
]

const attestations = [
  { id: 'waitlist-migration-applied', argument: '--migration' },
  { id: 'proxy-client-ip-confirmed', argument: '--proxy-client-ip' },
  { id: 'rate-limit-confirmed', argument: '--rate-limit' },
  { id: 'privacy-mailbox-confirmed', argument: '--privacy-mailbox' },
  { id: 'public-qa-confirmed', argument: '--public-qa' },
  { id: 'pr-gate-confirmed', argument: '--pr-gate' },
  { id: 'privacy-copy-baseline-confirmed', argument: '--privacy-copy' },
]

function argValue(name, fallback = '') {
  const prefix = `${name}=`
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument.startsWith(prefix)) return argument.slice(prefix.length)
    if (argument === name) {
      const nextArgument = process.argv[index + 1]
      return nextArgument && !nextArgument.startsWith('--') ? nextArgument : ''
    }
  }
  return fallback
}

function source(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
}

function assertIncludes(sourceText, needle, label) {
  if (!sourceText.includes(needle)) throw new Error(`${label}:missing_contract`)
}

function assertNotIncludes(sourceText, needle, label) {
  if (sourceText.includes(needle)) throw new Error(`${label}:forbidden_operation`)
}

function presenceStatus(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
    ? 'pass'
    : 'hold'
}

function environmentStatus(name, kind) {
  return kind === 'exact-true'
    ? process.env[name] === 'true'
      ? 'pass'
      : 'hold'
    : presenceStatus(name)
}

function attestationStatus(argument) {
  return argValue(argument) === 'confirmed' ? 'pass' : 'hold'
}

function runContract() {
  const scriptSource = source(files.script)
  const packageJson = JSON.parse(source(files.packageJson))
  const envExample = source(files.envExample)
  const releaseDoc = source(files.releaseDoc)
  const issueDoc = source(files.issueDoc)

  for (const forbidden of [
    ['write', 'File', 'Sync'].join(''),
    ['append', 'File', 'Sync'].join(''),
    ['node:fs', '/promises'].join(''),
    ['node:child', '_process'].join(''),
    ['prisma', ' migrate'].join(''),
    ['.screen', 'shot('].join(''),
    ['accessibility', '.snapshot'].join(''),
    ['route', 'From', 'HAR'].join(''),
  ]) {
    assertNotIncludes(scriptSource, forbidden, 'read-only-policy')
  }

  assertIncludes(
    packageJson.scripts['qa:issue103:prelaunch-traffic'],
    'issue-103-prelaunch-traffic-attestation.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue103:prelaunch-traffic -- --mode=contract',
    'pr-gate',
  )
  assertIncludes(releaseDoc, '--mode=preflight', 'release-doc')
  assertIncludes(releaseDoc, '値を出力しない', 'release-doc')
  assertIncludes(releaseDoc, '外部状態を自動確認したことにはならない', 'release-doc')
  assertIncludes(releaseDoc, 'WAITLIST_TRUST_PROXY_HEADERS=true', 'release-doc')
  assertIncludes(envExample, 'WAITLIST_TRUST_PROXY_HEADERS=false', 'env-example')
  assertIncludes(issueDoc, '未確認項目が 1 つでもあれば HOLD', 'issue-doc')

  return {
    issue,
    mode,
    result: 'pass',
    evidence_policy:
      'read-only and redacted: no secret values, connection strings, emails, payloads, screenshots, traces, or HAR',
    checked_files: Object.values(files),
    checks: [
      'read-only-policy',
      'redacted-output-policy',
      'required-environment-status-only',
      'trusted-proxy-exact-true',
      'human-attestation-required',
      'hold-by-default',
      'pr-gate-integration',
    ],
  }
}

function runPreflight() {
  const target = argValue('--target')
  const targetCheck = {
    id: 'target-environment',
    kind: 'input',
    status: ['staging', 'production'].includes(target) ? 'pass' : 'hold',
  }
  const environmentChecks = requiredEnvironment.map(({ id, name, kind }) => ({
    id,
    kind,
    status: environmentStatus(name, kind),
  }))
  const attestationChecks = attestations.map(({ id, argument }) => ({
    id,
    kind: 'human-attestation',
    status: attestationStatus(argument),
  }))
  const checks = [targetCheck, ...environmentChecks, ...attestationChecks]
  const result = checks.every((check) => check.status === 'pass') ? 'go' : 'hold'

  return {
    issue,
    mode,
    target: targetCheck.status === 'pass' ? target : 'unconfirmed',
    result,
    evidence_policy: 'status-only: environment and attestation values are never emitted',
    checks,
  }
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(exitCode)
}

try {
  if (mode === 'contract') emit(runContract())
  if (mode === 'preflight') {
    const result = runPreflight()
    emit(result, result.result === 'go' ? 0 : 1)
  }
  throw new Error('unsupported_mode')
} catch (error) {
  emit(
    {
      issue,
      mode,
      result: 'fail',
      evidence: 'redacted-failure-output',
      reason: error instanceof Error ? error.message : 'unknown_error',
    },
    1,
  )
}
