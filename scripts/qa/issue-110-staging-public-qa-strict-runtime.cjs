const { spawnSync } = require('node:child_process')
const { lookup } = require('node:dns').promises
const { readFileSync } = require('node:fs')
const { BlockList, isIP } = require('node:net')
const { join } = require('node:path')
const {
  publicHttpsUrlStatus: strictPublicHttpsUrlStatus,
} = require('./public-staging-url-policy.cjs')

const issue = 'ISSUE-110'
const repoRoot = process.cwd()
const publicQaArguments = Object.freeze(['--mode=app'])
const allowedArgumentNames = new Set(['mode'])

const files = {
  script: 'scripts/qa/issue-110-staging-public-qa-strict-runtime.cjs',
  urlPolicy: 'scripts/qa/public-staging-url-policy.cjs',
  publicQaScript: 'scripts/qa/issue-075-lp-public-qa.cjs',
  targetContractScript: 'scripts/qa/issue-106-staging-target-contract.cjs',
  packageJson: 'package.json',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  issueDoc: 'docs/issues/ISSUE-110-staging-public-qa-strict-runtime.md',
}

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
  const mode = ['contract', 'runtime'].includes(requestedMode) ? requestedMode : 'unsupported'
  return { mode }
}

function source(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
}

function assertIncludes(sourceText, needle, label) {
  if (!sourceText.includes(needle)) throw new Error(`${label}:missing_contract`)
}

const blockedAddresses = new BlockList()
const globalUnicastAddresses = new BlockList()
globalUnicastAddresses.addSubnet('2000::', 3, 'ipv6')
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6')
}

function publicIpAddressStatus(value) {
  const mappedIpv4 = value.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mappedIpv4) return publicIpAddressStatus(mappedIpv4)
  const family = isIP(value)
  if (family === 4) return blockedAddresses.check(value, 'ipv4') ? 'hold' : 'pass'
  if (family === 6) {
    return globalUnicastAddresses.check(value, 'ipv6') && !blockedAddresses.check(value, 'ipv6')
      ? 'pass'
      : 'hold'
  }
  return 'hold'
}

async function publicDnsResolutionStatus(hostname, resolveHostname = lookup) {
  try {
    const addresses = await resolveHostname(hostname, { all: true, verbatim: true })
    return Array.isArray(addresses) &&
      addresses.length > 0 &&
      addresses.every(({ address }) => publicIpAddressStatus(address) === 'pass')
      ? 'pass'
      : 'hold'
  } catch {
    return 'hold'
  }
}

function publicQaEnvironment(environment, baseUrl) {
  const allowedKeys = [
    'HOME',
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'NODE_ENV',
    'CI',
    'CODEX_RUNTIME_NODE_MODULES',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ]
  const childEnvironment = {
    PLAYWRIGHT_BASE_URL: baseUrl,
    NO_COLOR: '1',
  }

  for (const key of allowedKeys) {
    if (typeof environment[key] === 'string') childEnvironment[key] = environment[key]
  }
  return childEnvironment
}

function normalizeExecution(execution) {
  return execution && execution.status === 0 && !execution.error && !execution.signal
    ? 'pass'
    : 'hold'
}

function runContract() {
  const scriptSource = source(files.script)
  const urlPolicySource = source(files.urlPolicy)
  const publicQaSource = source(files.publicQaScript)
  const targetContractSource = source(files.targetContractScript)
  const packageJson = JSON.parse(source(files.packageJson))
  const releaseDoc = source(files.releaseDoc)
  const issueDoc = source(files.issueDoc)

  if (JSON.stringify(publicQaArguments) !== JSON.stringify(['--mode=app'])) {
    throw new Error('runtime-command:forbidden_operation')
  }
  assertIncludes(
    packageJson.scripts['qa:issue110:staging-public'],
    'issue-110-staging-public-qa-strict-runtime.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue110:staging-public -- --mode=contract',
    'pr-gate',
  )
  assertIncludes(scriptSource, "require('./public-staging-url-policy.cjs')", 'shared-url-policy')
  assertIncludes(
    targetContractSource,
    "require('./public-staging-url-policy.cjs')",
    'target-contract',
  )
  assertIncludes(urlPolicySource, 'function publicHttpsUrlStatus(value)', 'shared-url-policy')
  assertIncludes(targetContractSource, "'public-https-origin-only'", 'target-contract')
  assertIncludes(publicQaSource, "context.route('**/*'", 'waitlist-mock')
  assertIncludes(publicQaSource, "method !== 'POST'", 'waitlist-mock')
  assertIncludes(publicQaSource, "url.pathname !== '/v1/waitlist'", 'waitlist-mock')
  assertIncludes(publicQaSource, 'waitlistPostCount', 'waitlist-mock')
  assertIncludes(publicQaSource, "url.pathname === '/v1/metrics/vitals'", 'waitlist-mock')
  assertIncludes(publicQaSource, 'metricsPostCount', 'waitlist-mock')
  assertIncludes(publicQaSource, 'blockedHttpRequestCount', 'waitlist-mock')
  assertIncludes(publicQaSource, "context.routeWebSocket('**/*'", 'waitlist-mock')
  assertIncludes(publicQaSource, 'blockedWebSocketCount', 'waitlist-mock')
  assertIncludes(publicQaSource, 'assertNetworkState(target, networkState)', 'waitlist-mock')
  assertIncludes(
    publicQaSource,
    'await context.close()\n        }\n        assertNetworkState(target, networkState)',
    'waitlist-mock',
  )
  assertIncludes(publicQaSource, "serviceWorkers: 'block'", 'waitlist-mock')
  assertIncludes(publicQaSource, "mode === 'app' ? await runAppSmoke()", 'public-qa-app-mode')
  assertIncludes(releaseDoc, 'pnpm qa:issue110:staging-public', 'release-doc')
  assertIncludes(releaseDoc, 'STAGING_EGRESS_CONTROL_CONFIRMED=confirmed', 'release-doc')
  assertIncludes(releaseDoc, 'host、email、payload', 'release-doc')
  assertIncludes(issueDoc, '実DBへ書き込まない', 'issue-doc')
  assertIncludes(scriptSource, "stdio: 'ignore'", 'runtime-redaction')

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    evidence_policy:
      'read-only and redacted: no staging host, email, request payload, browser raw output, or external process in contract mode',
    checked_files: Object.values(files),
    checks: [
      'contract-mode-no-external-process',
      'issue-106-public-https-origin-alignment',
      'staging-url-required',
      'dns-public-address-required',
      'default-https-port-only',
      'egress-control-operator-attestation',
      'localhost-and-ip-literal-rejected',
      'waitlist-post-mocked-before-navigation',
      'http-and-websocket-policy-violations-fail-qa',
      'public-qa-app-mode-only',
      'child-environment-allowlist',
      'child-raw-output-discarded',
      'pr-gate-integration',
    ],
  }
}

async function runRuntime({
  environment = process.env,
  execute = spawnSync,
  nodePath = process.execPath,
  publicQaScriptPath = join(repoRoot, files.publicQaScript),
  resolveHostname = lookup,
} = {}) {
  const baseUrl = environment.STAGING_BASE_URL
  const baseUrlStatus = strictPublicHttpsUrlStatus(baseUrl)
  const egressControlStatus =
    environment.STAGING_EGRESS_CONTROL_CONFIRMED === 'confirmed' ? 'pass' : 'hold'
  if (baseUrlStatus === 'hold') {
    return {
      issue,
      mode: 'runtime',
      target: 'staging',
      result: 'hold',
      evidence_policy:
        'status-only: host, email, payload, and browser raw output are never emitted',
      checks: [
        { id: 'staging-base-url', kind: 'public-https-origin', status: 'hold' },
        {
          id: 'staging-egress-control',
          kind: 'operator-attestation',
          status: egressControlStatus,
        },
        { id: 'staging-dns-addresses', kind: 'public-addresses-only', status: 'hold' },
        { id: 'waitlist-post-mock', kind: 'read-only-browser-route', status: 'hold' },
        { id: 'lp-privacy-public-qa', kind: 'browser-qa', status: 'hold' },
      ],
    }
  }

  if (egressControlStatus === 'hold') {
    return {
      issue,
      mode: 'runtime',
      target: 'staging',
      result: 'hold',
      evidence_policy:
        'status-only: host, email, payload, and browser raw output are never emitted',
      checks: [
        { id: 'staging-base-url', kind: 'public-https-origin', status: 'pass' },
        {
          id: 'staging-egress-control',
          kind: 'operator-attestation',
          status: 'hold',
        },
        { id: 'staging-dns-addresses', kind: 'public-addresses-only', status: 'hold' },
        { id: 'waitlist-post-mock', kind: 'read-only-browser-route', status: 'hold' },
        { id: 'lp-privacy-public-qa', kind: 'browser-qa', status: 'hold' },
      ],
    }
  }

  const parsedBaseUrl = new URL(baseUrl.trim())
  const dnsStatus = await publicDnsResolutionStatus(parsedBaseUrl.hostname, resolveHostname)
  if (dnsStatus === 'hold') {
    return {
      issue,
      mode: 'runtime',
      target: 'staging',
      result: 'hold',
      evidence_policy:
        'status-only: host, email, payload, and browser raw output are never emitted',
      checks: [
        { id: 'staging-base-url', kind: 'public-https-origin', status: 'pass' },
        { id: 'staging-egress-control', kind: 'operator-attestation', status: 'pass' },
        { id: 'staging-dns-addresses', kind: 'public-addresses-only', status: 'hold' },
        { id: 'waitlist-post-mock', kind: 'read-only-browser-route', status: 'hold' },
        { id: 'lp-privacy-public-qa', kind: 'browser-qa', status: 'hold' },
      ],
    }
  }

  let execution
  try {
    execution = execute(nodePath, [publicQaScriptPath, ...publicQaArguments], {
      cwd: repoRoot,
      env: publicQaEnvironment(environment, baseUrl.trim()),
      stdio: 'ignore',
      timeout: 180_000,
      killSignal: 'SIGKILL',
    })
  } catch {
    execution = { status: null, signal: null, error: new Error('redacted-runtime-error') }
  }
  const publicQaStatus = normalizeExecution(execution)

  return {
    issue,
    mode: 'runtime',
    target: 'staging',
    result: publicQaStatus,
    evidence_policy: 'status-only: host, email, payload, and browser raw output are never emitted',
    checks: [
      { id: 'staging-base-url', kind: 'public-https-origin', status: 'pass' },
      { id: 'staging-egress-control', kind: 'operator-attestation', status: 'pass' },
      { id: 'staging-dns-addresses', kind: 'public-addresses-only', status: 'pass' },
      {
        id: 'waitlist-post-mock',
        kind: 'read-only-browser-route',
        status: publicQaStatus,
      },
      { id: 'lp-privacy-public-qa', kind: 'browser-qa', status: publicQaStatus },
    ],
  }
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exitCode = exitCode
}

function safeFailureReason(error) {
  if (!(error instanceof Error)) return 'contract_check_failed'
  if (error.message === 'invalid_arguments') return 'invalid_arguments'
  if (error.message === 'unsupported_mode') return 'unsupported_mode'
  if (
    /^(runtime-command|package-script|pr-gate|target-contract|waitlist-mock|public-qa-app-mode|release-doc|issue-doc|runtime-redaction):(missing_contract|forbidden_operation)$/.test(
      error.message,
    )
  ) {
    return error.message
  }
  return 'contract_check_failed'
}

async function main(argv = process.argv.slice(2)) {
  let mode = 'unknown'
  try {
    const parsed = parseArguments(argv)
    mode = parsed.mode
    if (mode === 'contract') {
      emit(runContract())
    } else if (mode === 'runtime') {
      const result = await runRuntime()
      emit(result, result.result === 'pass' ? 0 : 1)
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
}

if (require.main === module) void main()

module.exports = {
  normalizeExecution,
  parseArguments,
  publicDnsResolutionStatus,
  publicIpAddressStatus,
  publicQaArguments,
  publicQaEnvironment,
  runRuntime,
  strictPublicHttpsUrlStatus,
}
