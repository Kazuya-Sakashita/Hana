const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const issue = 'ISSUE-091'
const mode = argValue('--mode', 'contract')

const repoRoot = process.cwd()

const files = {
  packageJson: 'package.json',
  parse: 'src/features/waitlist/server/parse.ts',
  rateLimit: 'src/features/waitlist/server/rate-limit.ts',
  route: 'src/app/v1/waitlist/route.ts',
  schema: 'prisma/schema.prisma',
  migration: 'prisma/migrations/20260725062100_add_waitlist_signups/migration.sql',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  lpEvaluation: 'docs/design/current-lp-evaluation.md',
  privacyPage: 'src/app/privacy/page.tsx',
}

const checks = [
  'read-only-artifact-policy',
  'production-pepper-required',
  'development-pepper-non-production-only',
  'waitlist-migration-contract',
  'rate-limit-and-retry-after',
  'safe-structured-logging',
  'public-copy-boundary',
  'pr-gate-integration',
]

function argValue(name, fallback) {
  const exact = process.argv.find((arg) => arg === name)
  if (exact) return true
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function source(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
}

function assertIncludes(sourceText, needle, label) {
  if (!sourceText.includes(needle)) throw new Error(`${label}: missing ${needle}`)
}

function assertNotIncludes(sourceText, needle, label) {
  if (sourceText.includes(needle)) throw new Error(`${label}: forbidden ${needle}`)
}

function assertMatch(sourceText, pattern, label) {
  if (!pattern.test(sourceText)) throw new Error(`${label}: pattern_not_found`)
}

function assertArtifactPolicy() {
  const scriptSource = source('scripts/qa/issue-091-waitlist-readiness-contract.cjs')
  const forbidden = [
    ['write', 'File', 'Sync'].join(''),
    ['append', 'File', 'Sync'].join(''),
    ['write', 'File('].join(''),
    ['append', 'File('].join(''),
    ['node:fs', '/promises'].join(''),
    ['.screen', 'shot('].join(''),
    ['accessibility', '.snapshot'].join(''),
    ['.trac', 'ing'].join(''),
    ['route', 'From', 'HAR'].join(''),
    ['process.env.', 'WAITLIST_EMAIL_HASH_PEPPER', ')'].join(''),
  ]
  for (const needle of forbidden) assertNotIncludes(scriptSource, needle, 'artifact-policy')
}

function consoleCallBlocks(sourceText) {
  const blocks = []
  const consoleCall = /console\.(log|info|warn|error|debug)\s*\(/g
  let match
  while ((match = consoleCall.exec(sourceText)) !== null) {
    let depth = 0
    let end = match.index
    for (let index = match.index; index < sourceText.length; index += 1) {
      const char = sourceText[index]
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0) {
          end = index + 1
          break
        }
      }
    }
    blocks.push(sourceText.slice(match.index, end))
  }
  return blocks
}

function assertProductionPepper() {
  const parseSource = source(files.parse)
  assertIncludes(parseSource, 'WAITLIST_EMAIL_HASH_PEPPER', 'production-pepper')
  assertIncludes(parseSource, "process.env.NODE_ENV === 'production'", 'production-pepper')
  assertIncludes(parseSource, 'WAITLIST_EMAIL_HASH_PEPPER is not set', 'production-pepper')
  assertIncludes(parseSource, 'DEVELOPMENT_HASH_PEPPER', 'development-pepper')
  assertIncludes(parseSource, 'return DEVELOPMENT_HASH_PEPPER', 'development-pepper')
}

function assertMigration() {
  const schemaSource = source(files.schema)
  const migrationSource = source(files.migration)
  assertIncludes(schemaSource, 'model WaitlistSignup', 'schema')
  assertIncludes(schemaSource, '@unique @map("email_hash") @db.Char(64)', 'schema')
  assertIncludes(schemaSource, '@@index([createdAt])', 'schema')
  assertIncludes(migrationSource, 'CREATE TABLE "waitlist_signups"', 'migration')
  assertIncludes(
    migrationSource,
    'CREATE UNIQUE INDEX "waitlist_signups_email_hash_key" ON "waitlist_signups"("email_hash");',
    'migration',
  )
  assertIncludes(
    migrationSource,
    'CREATE INDEX "waitlist_signups_created_at_idx" ON "waitlist_signups"("created_at");',
    'migration',
  )
}

function assertRateLimit() {
  const rateLimitSource = source(files.rateLimit)
  const routeSource = source(files.route)
  assertIncludes(rateLimitSource, 'const WINDOW_MS = 10 * 60 * 1000', 'rate-limit')
  assertIncludes(rateLimitSource, 'const MAX_SUBMISSIONS = 12', 'rate-limit')
  assertIncludes(rateLimitSource, 'x-forwarded-for', 'rate-limit')
  assertIncludes(rateLimitSource, 'x-real-ip', 'rate-limit')
  assertIncludes(rateLimitSource, 'WAITLIST_RETRY_AFTER_SECONDS', 'rate-limit')
  assertIncludes(routeSource, 'assertWaitlistRateLimit(request)', 'route-rate-limit')
  assertIncludes(routeSource, "response.headers.set('Retry-After'", 'route-rate-limit')
}

function assertSafeLogging() {
  const routeSource = source(files.route)
  const logBlocks = consoleCallBlocks(routeSource)
  if (logBlocks.length === 0) throw new Error('safe-logging: log_block_missing')
  const acceptedLogBlock = logBlocks.find((block) => block.includes("operation: 'waitlist-signup'"))
  if (!acceptedLogBlock) throw new Error('safe-logging: accepted_log_missing')

  for (const needle of [
    "operation: 'waitlist-signup'",
    "status: 'accepted'",
    'source: input.source',
    'privacyPolicyVersion: input.privacyPolicyVersion',
    "level: 'info'",
    'ts: now.toISOString()',
  ]) {
    assertIncludes(acceptedLogBlock, needle, 'safe-logging')
  }

  for (const forbidden of ['email:', 'emailHash:', 'id:', 'input.email', 'input.emailHash']) {
    for (const logBlock of logBlocks) assertNotIncludes(logBlock, forbidden, 'safe-logging')
  }
}

function assertPublicCopyBoundary() {
  const releaseDoc = source(files.releaseDoc)
  const lpEvaluation = source(files.lpEvaluation)
  const privacySource = source(files.privacyPage)
  assertIncludes(releaseDoc, 'メール配信基盤のサービス名を明記せず', 'release-doc')
  assertIncludes(releaseDoc, 'privacy@hana.app', 'release-doc')
  assertIncludes(lpEvaluation, 'WAITLIST_EMAIL_HASH_PEPPER', 'lp-evaluation')
  assertIncludes(lpEvaluation, 'migration の適用確認', 'lp-evaluation')
  assertIncludes(privacySource, '現時点ではサービス名を明記せず', 'privacy-copy')
  assertNotIncludes(privacySource, '法務確認済み', 'privacy-copy')
  assertNotIncludes(privacySource, 'メール配信基盤は確定', 'privacy-copy')
}

function assertPackageGate() {
  const packageJson = JSON.parse(source(files.packageJson))
  assertIncludes(
    packageJson.scripts['qa:issue091:waitlist-readiness'],
    'issue-091-waitlist-readiness-contract.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue091:waitlist-readiness -- --mode=contract',
    'pr-gate',
  )
}

function runContract() {
  assertArtifactPolicy()
  assertProductionPepper()
  assertMigration()
  assertRateLimit()
  assertSafeLogging()
  assertPublicCopyBoundary()
  assertPackageGate()
}

try {
  if (mode !== 'contract') throw new Error(`unsupported_mode:${mode}`)
  runContract()
  console.log(
    JSON.stringify(
      {
        issue,
        mode,
        result: 'pass',
        artifact_policy:
          'read-only: no secret values, emails, raw payloads, screenshots, traces, HAR, or QA evidence file is written',
        checked_files: Object.values(files),
        checks,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(
    JSON.stringify({
      issue,
      mode,
      result: 'fail',
      evidence: 'redacted-failure-output',
      reason: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
}
