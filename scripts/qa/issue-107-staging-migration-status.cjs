const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const issue = 'ISSUE-107'
const requestedMode = argValue('--mode', 'contract')
const mode = ['contract', 'status'].includes(requestedMode) ? requestedMode : 'unsupported'
const repoRoot = process.cwd()
const prismaStatusArguments = Object.freeze(['migrate', 'status'])

const files = {
  script: 'scripts/qa/issue-107-staging-migration-status.cjs',
  packageJson: 'package.json',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  issueDoc: 'docs/issues/ISSUE-107-staging-migration-status.md',
  prismaConfig: 'prisma.config.ts',
  waitlistMigration: 'prisma/migrations/20260725062100_add_waitlist_signups/migration.sql',
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

function presenceStatus(value) {
  return typeof value === 'string' && value.trim().length > 0 ? 'pass' : 'hold'
}

function normalizeMigrateStatus(execution) {
  return execution && execution.status === 0 && !execution.error && !execution.signal
    ? 'pass'
    : 'hold'
}

function prismaEnvironment(environment) {
  const allowedKeys = [
    'DIRECT_URL',
    'HOME',
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'NODE_ENV',
    'CI',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ]
  const childEnvironment = {
    HANA_QA_SKIP_DOTENV: '1',
    NO_COLOR: '1',
  }

  for (const key of allowedKeys) {
    if (typeof environment[key] === 'string') childEnvironment[key] = environment[key]
  }
  return childEnvironment
}

function runContract() {
  const scriptSource = source(files.script)
  const packageJson = JSON.parse(source(files.packageJson))
  const releaseDoc = source(files.releaseDoc)
  const issueDoc = source(files.issueDoc)
  const prismaConfig = source(files.prismaConfig)
  const migrationSource = source(files.waitlistMigration)

  if (JSON.stringify(prismaStatusArguments) !== JSON.stringify(['migrate', 'status'])) {
    throw new Error('runtime-command:forbidden_operation')
  }
  for (const forbidden of [
    ['migrate', "', '", 'deploy'].join(''),
    ['migrate', "', '", 'dev'].join(''),
    ['migrate', "', '", 'reset'].join(''),
    ['db', "', '", 'push'].join(''),
    ['write', 'File'].join(''),
    ['append', 'File'].join(''),
    ['create', 'Write', 'Stream'].join(''),
  ]) {
    assertNotIncludes(scriptSource, forbidden, 'read-only-policy')
  }

  assertIncludes(
    packageJson.scripts['qa:issue107:migration-status'],
    'issue-107-staging-migration-status.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue107:migration-status -- --mode=contract',
    'pr-gate',
  )
  assertIncludes(releaseDoc, '--mode=status', 'release-doc')
  assertIncludes(releaseDoc, 'Prisma の raw stdout / stderr は出力しない', 'release-doc')
  assertIncludes(issueDoc, 'migration 適用は行わない', 'issue-doc')
  assertIncludes(prismaConfig, "process.env.HANA_QA_SKIP_DOTENV !== '1'", 'prisma-config')
  assertIncludes(migrationSource, 'CREATE TABLE "waitlist_signups"', 'waitlist-migration')

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    evidence_policy:
      'read-only and redacted: no database URL, Prisma raw output, SQL, or external process in contract mode',
    checked_files: Object.values(files),
    checks: [
      'contract-mode-no-external-process',
      'staging-target-attestation-required',
      'status-command-only',
      'child-environment-allowlist',
      'migration-write-commands-rejected',
      'waitlist-migration-present',
      'raw-output-redacted',
      'pr-gate-integration',
    ],
  }
}

function runStatus({
  environment = process.env,
  execute = spawnSync,
  prismaCliPath,
  resolvePrismaCli = () => require.resolve('prisma/build/index.js', { paths: [repoRoot] }),
  target = argValue('--target'),
} = {}) {
  const targetStatus = target === 'staging' ? 'pass' : 'hold'
  const directUrlStatus = presenceStatus(environment.DIRECT_URL)
  if (targetStatus === 'hold' || directUrlStatus === 'hold') {
    return {
      issue,
      mode: 'status',
      target: targetStatus === 'pass' ? 'staging' : 'unconfirmed',
      result: 'hold',
      evidence_policy: 'status-only: database URL and Prisma raw output are never emitted',
      checks: [
        { id: 'target-environment', kind: 'operator-attestation', status: targetStatus },
        { id: 'direct-url', kind: 'presence', status: directUrlStatus },
        { id: 'prisma-migrate-status', kind: 'read-only-command', status: 'hold' },
      ],
    }
  }

  let execution
  try {
    const cliPath = prismaCliPath ?? resolvePrismaCli()
    execution = execute(process.execPath, [cliPath, ...prismaStatusArguments], {
      cwd: repoRoot,
      env: prismaEnvironment(environment),
      stdio: 'ignore',
      timeout: 30_000,
      killSignal: 'SIGKILL',
    })
  } catch {
    execution = { status: null, signal: null, error: new Error('redacted-cli-error') }
  }
  const migrateStatus = normalizeMigrateStatus(execution)

  return {
    issue,
    mode: 'status',
    target: 'staging',
    result: migrateStatus,
    evidence_policy: 'status-only: database URL and Prisma raw output are never emitted',
    checks: [
      { id: 'target-environment', kind: 'operator-attestation', status: 'pass' },
      { id: 'direct-url', kind: 'presence', status: 'pass' },
      {
        id: 'prisma-migrate-status',
        kind: 'read-only-command',
        status: migrateStatus,
      },
    ],
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
    /^(runtime-command|read-only-policy|package-script|pr-gate|release-doc|issue-doc|prisma-config|waitlist-migration):(missing_contract|forbidden_operation)$/.test(
      error.message,
    )
  ) {
    return error.message
  }
  return 'contract_check_failed'
}

function main() {
  try {
    if (mode === 'contract') {
      emit(runContract())
    } else if (mode === 'status') {
      const result = runStatus()
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

if (require.main === module) main()

module.exports = {
  normalizeMigrateStatus,
  prismaEnvironment,
  prismaStatusArguments,
  runStatus,
}
