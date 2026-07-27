const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const issue = 'ISSUE-103'
const repoRoot = process.cwd()
const privacyAttestationScope = 'prelaunch'
const privacyAttestationVersion = 'prelaunch-mailbox-v1'
const privacyAttestationMaxAgeMs = 30 * 60 * 1000

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
  { id: 'waitlist-migration-applied', name: 'migration' },
  { id: 'proxy-client-ip-confirmed', name: 'proxy-client-ip' },
  { id: 'rate-limit-confirmed', name: 'rate-limit' },
  { id: 'privacy-mailbox-receiving-confirmed', name: 'privacy-mailbox-receiving' },
  {
    id: 'privacy-mailbox-access-control-confirmed',
    name: 'privacy-mailbox-access-control',
  },
  { id: 'privacy-guidance-stop-confirmed', name: 'privacy-guidance-stop' },
  {
    id: 'privacy-registration-deletion-confirmed',
    name: 'privacy-registration-deletion',
  },
  { id: 'public-qa-confirmed', name: 'public-qa' },
  { id: 'pr-gate-confirmed', name: 'pr-gate' },
  { id: 'privacy-copy-baseline-confirmed', name: 'privacy-copy' },
]

const privacyMetadataArguments = [
  'privacy-attestation-scope',
  'privacy-attestation-version',
  'privacy-attested-at',
]
const allowedArgumentNames = new Set([
  'mode',
  'target',
  ...attestations.map(({ name }) => name),
  ...privacyMetadataArguments,
])

function parseArguments(argv) {
  const tokens = [...argv]
  if (tokens[0] === '--') tokens.shift()
  const values = new Map()

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--') || token === '--') throw new Error('invalid_arguments')

    const separatorIndex = token.indexOf('=')
    const name = token.slice(2, separatorIndex >= 0 ? separatorIndex : undefined)
    let value = separatorIndex >= 0 ? token.slice(separatorIndex + 1) : ''

    if (separatorIndex < 0) {
      const nextToken = tokens[index + 1]
      if (!nextToken || nextToken.startsWith('--')) throw new Error('invalid_arguments')
      value = nextToken
      index += 1
    }

    if (!allowedArgumentNames.has(name) || values.has(name) || value.length === 0) {
      throw new Error('invalid_arguments')
    }
    values.set(name, value)
  }

  const requestedMode = values.get('mode') ?? 'contract'
  const mode = ['contract', 'preflight'].includes(requestedMode) ? requestedMode : 'unsupported'
  if (mode === 'contract' && [...values.keys()].some((name) => name !== 'mode')) {
    throw new Error('invalid_arguments')
  }

  return { mode, values }
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

function privacyAttestedAtStatus(value, now) {
  if (typeof value !== 'string') return 'hold'
  const attestedAtMs = Date.parse(value)
  const ageMs = now - attestedAtMs
  return Number.isFinite(attestedAtMs) && ageMs >= 0 && ageMs <= privacyAttestationMaxAgeMs
    ? 'pass'
    : 'hold'
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
  assertIncludes(releaseDoc, '--privacy-attestation-version=prelaunch-mailbox-v1', 'release-doc')
  assertIncludes(envExample, 'WAITLIST_TRUST_PROXY_HEADERS=false', 'env-example')
  assertIncludes(issueDoc, '未確認項目が 1 つでもあれば HOLD', 'issue-doc')

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    evidence_policy:
      'read-only and redacted: no secret values, connection strings, emails, payloads, screenshots, traces, or HAR',
    checked_files: Object.values(files),
    checks: [
      'read-only-policy',
      'redacted-output-policy',
      'strict-cli-input',
      'required-environment-status-only',
      'trusted-proxy-exact-true',
      'privacy-attestation-scope-version-freshness',
      'human-attestation-required',
      'hold-by-default',
      'pr-gate-integration',
    ],
  }
}

function runPreflight(values, now = Date.now()) {
  const target = values.get('target')
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
  const privacyAttestedAt = values.get('privacy-attested-at')
  const privacyMetadataChecks = [
    {
      id: 'privacy-attestation-scope',
      kind: 'exact-match',
      status: values.get('privacy-attestation-scope') === privacyAttestationScope ? 'pass' : 'hold',
    },
    {
      id: 'privacy-attestation-version',
      kind: 'exact-match',
      status:
        values.get('privacy-attestation-version') === privacyAttestationVersion ? 'pass' : 'hold',
    },
    {
      id: 'privacy-attestation-freshness',
      kind: 'fresh-date-time',
      status: privacyAttestedAtStatus(privacyAttestedAt, now),
    },
  ]
  const attestationChecks = attestations.map(({ id, name }) => ({
    id,
    kind: 'human-attestation',
    status: values.get(name) === 'confirmed' ? 'pass' : 'hold',
  }))
  const checks = [targetCheck, ...environmentChecks, ...privacyMetadataChecks, ...attestationChecks]
  const result = checks.every((check) => check.status === 'pass') ? 'go' : 'hold'
  const hasFreshPrivacyAttestation = privacyMetadataChecks.every((check) => check.status === 'pass')

  return {
    issue,
    mode: 'preflight',
    target: targetCheck.status === 'pass' ? target : 'unconfirmed',
    privacy_attestation: {
      scope: hasFreshPrivacyAttestation ? privacyAttestationScope : 'unconfirmed',
      version: hasFreshPrivacyAttestation ? privacyAttestationVersion : 'unconfirmed',
      attested_at: hasFreshPrivacyAttestation
        ? new Date(Date.parse(privacyAttestedAt)).toISOString()
        : 'unconfirmed',
    },
    result,
    evidence_policy: 'status-only: environment and attestation values are never emitted',
    checks,
  }
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exitCode = exitCode
}

function safeFailureReason(error) {
  if (!(error instanceof Error)) return 'contract_check_failed'
  if (error.message === 'unsupported_mode') return 'unsupported_mode'
  if (
    /^(read-only-policy|package-script|pr-gate|release-doc|env-example|issue-doc):(missing_contract|forbidden_operation)$/.test(
      error.message,
    )
  ) {
    return error.message
  }
  return 'contract_check_failed'
}

function main(argv) {
  let parsed
  try {
    parsed = parseArguments(argv)
  } catch {
    emit(
      {
        issue,
        mode: 'invalid',
        result: 'hold',
        evidence: 'redacted-invalid-arguments',
        reason: 'invalid_arguments',
      },
      1,
    )
    return
  }

  try {
    if (parsed.mode === 'contract') {
      emit(runContract())
    } else if (parsed.mode === 'preflight') {
      const result = runPreflight(parsed.values)
      emit(result, result.result === 'go' ? 0 : 1)
    } else {
      throw new Error('unsupported_mode')
    }
  } catch (error) {
    emit(
      {
        issue,
        mode: parsed.mode,
        result: 'fail',
        evidence: 'redacted-failure-output',
        reason: safeFailureReason(error),
      },
      1,
    )
  }
}

if (require.main === module) main(process.argv.slice(2))
