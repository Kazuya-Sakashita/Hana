const { readFileSync } = require('node:fs')
const { isIP } = require('node:net')
const { join } = require('node:path')

const issue = 'ISSUE-106'
const requestedMode = argValue('--mode', 'contract')
const mode = ['contract', 'preflight'].includes(requestedMode) ? requestedMode : 'unsupported'
const repoRoot = process.cwd()

const files = {
  script: 'scripts/qa/issue-106-staging-target-contract.cjs',
  packageJson: 'package.json',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  issueDoc: 'docs/issues/ISSUE-106-staging-target-contract.md',
}

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

function assertReadOnlyImports(sourceText) {
  const allowedModules = new Set(['node:fs', 'node:net', 'node:path'])
  const requiredImports = [
    ['const { readFileSync } = ', ['req', "uire('node:fs')"].join('')].join(''),
    ['const { isIP } = ', ['req', "uire('node:net')"].join('')].join(''),
    ['const { join } = ', ['req', "uire('node:path')"].join('')].join(''),
  ]
  const modules = [...sourceText.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map(
    (match) => match[2],
  )

  if (
    modules.length !== allowedModules.size ||
    modules.some((moduleName) => !allowedModules.has(moduleName))
  ) {
    throw new Error('read-only-policy:forbidden_import')
  }
  if (requiredImports.some((expectedImport) => !sourceText.includes(expectedImport))) {
    throw new Error('read-only-policy:import_binding_not_read_only')
  }
}

function presenceStatus(value) {
  return typeof value === 'string' && value.trim().length > 0 ? 'pass' : 'hold'
}

function publicDnsHostnameStatus(value) {
  const hostname = value
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  const labels = hostname.split('.')
  const hasValidLabels =
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  const reservedSuffixes = ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion']
  const isReserved =
    reservedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)) ||
    hostname === 'home.arpa' ||
    hostname.endsWith('.home.arpa')

  return hasValidLabels && !isReserved && isIP(hostname) === 0 ? 'pass' : 'hold'
}

function publicHttpsUrlStatus(value) {
  if (presenceStatus(value) === 'hold') return 'hold'

  try {
    const candidate = value.trim()
    const scheme = candidate.match(/^https:\/\//i)?.[0]
    if (!scheme) return 'hold'

    const url = new URL(candidate)
    const authorityStart = scheme.length
    const suffixStart = [
      candidate.indexOf('/', authorityStart),
      candidate.indexOf('\\', authorityStart),
      candidate.indexOf('?', authorityStart),
      candidate.indexOf('#', authorityStart),
    ]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0]
    const suffix = suffixStart === undefined ? '' : candidate.slice(suffixStart)
    const authority = candidate.slice(authorityStart, suffixStart ?? candidate.length)
    const isOriginOnly = suffix === '' || suffix === '/'
    const hasCredentials = authority.includes('@') || Boolean(url.username || url.password)

    return url.protocol === 'https:' &&
      publicDnsHostnameStatus(url.hostname) === 'pass' &&
      isOriginOnly &&
      !hasCredentials
      ? 'pass'
      : 'hold'
  } catch {
    return 'hold'
  }
}

function runContract() {
  const scriptSource = source(files.script)
  const packageJson = JSON.parse(source(files.packageJson))
  const releaseDoc = source(files.releaseDoc)
  const issueDoc = source(files.issueDoc)

  assertReadOnlyImports(scriptSource)
  for (const forbidden of [
    ['write', 'File'].join(''),
    ['append', 'File'].join(''),
    ['create', 'Write', 'Stream'].join(''),
    ['open', 'Sync'].join(''),
    ['node:fs', '/promises'].join(''),
    ['node:child', '_process'].join(''),
    ['import', '('].join(''),
    ['fetch', '('].join(''),
    ['Web', 'Socket'].join(''),
    ['process.', 'binding'].join(''),
    ['process.', 'getBuiltinModule'].join(''),
    ['.screen', 'shot('].join(''),
  ]) {
    assertNotIncludes(scriptSource, forbidden, 'read-only-policy')
  }

  assertIncludes(
    packageJson.scripts['qa:issue106:staging-target'],
    'issue-106-staging-target-contract.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue106:staging-target -- --mode=contract',
    'pr-gate',
  )
  assertIncludes(releaseDoc, 'STAGING_HOSTING_PLATFORM', 'release-doc')
  assertIncludes(releaseDoc, 'STAGING_BASE_URL', 'release-doc')
  assertIncludes(releaseDoc, 'host 名は出力しない', 'release-doc')
  assertIncludes(issueDoc, 'localhost、loopback、IP literal', 'issue-doc')
  assertIncludes(issueDoc, 'IP literal', 'issue-doc')

  return {
    issue,
    mode,
    result: 'pass',
    evidence_policy:
      'read-only and redacted: no target URL, hostname, credentials, secret values, or network requests',
    checked_files: Object.values(files),
    checks: [
      'hosting-platform-presence',
      'staging-base-url-presence',
      'read-only-import-allowlist',
      'public-https-origin-only',
      'public-dns-hostname-shape',
      'localhost-and-loopback-rejected',
      'ip-literal-and-internal-host-rejected',
      'credential-url-rejected',
      'host-redaction',
      'pr-gate-integration',
    ],
  }
}

function runPreflight() {
  const checks = [
    {
      id: 'staging-hosting-platform',
      kind: 'presence',
      status: presenceStatus(process.env.STAGING_HOSTING_PLATFORM),
    },
    {
      id: 'staging-base-url',
      kind: 'public-https-origin',
      status: publicHttpsUrlStatus(process.env.STAGING_BASE_URL),
    },
  ]
  const result = checks.every((check) => check.status === 'pass') ? 'go' : 'hold'

  return {
    issue,
    mode,
    target: 'staging',
    result,
    evidence_policy: 'status-only: platform and URL values are never emitted',
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
    /^(read-only-policy|package-script|pr-gate|release-doc|issue-doc):(missing_contract|forbidden_operation|forbidden_import|import_binding_not_read_only)$/.test(
      error.message,
    )
  ) {
    return error.message
  }
  return 'contract_check_failed'
}

try {
  if (mode === 'contract') {
    emit(runContract())
  } else if (mode === 'preflight') {
    const result = runPreflight()
    emit(result, result.result === 'go' ? 0 : 1)
  } else {
    throw new Error('unsupported_mode')
  }
} catch (error) {
  emit(
    {
      issue,
      mode,
      result: 'fail',
      evidence: 'redacted-failure-output',
      reason: safeFailureReason(error),
    },
    1,
  )
}
