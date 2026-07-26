import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-091-waitlist-readiness-contract.cjs', import.meta.url),
)
const contractOutput = execFileSync(process.execPath, [scriptPath, '--mode=contract'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
const contract = JSON.parse(contractOutput) as {
  issue: string
  mode: string
  result: string
  artifact_policy: string
  checked_files: string[]
  checks: string[]
}

const scriptSource = readFileSync(scriptPath, 'utf8')
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const releaseDoc = readFileSync(
  new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-091-waitlist-release-readiness.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

describe('ISSUE-091 waitlist release readiness gate', () => {
  it('runs a read-only contract gate for prelaunch waitlist readiness', () => {
    expect(contract).toMatchObject({
      issue: 'ISSUE-091',
      mode: 'contract',
      result: 'pass',
    })
    expect(contract.artifact_policy).toContain('read-only')
    expect(contract.artifact_policy).toContain('no secret values')
    expect(contract.checked_files).toEqual(
      expect.arrayContaining([
        'src/features/waitlist/server/parse.ts',
        'src/features/waitlist/server/rate-limit.ts',
        'src/app/v1/waitlist/route.ts',
        'prisma/schema.prisma',
        'prisma/migrations/20260725062100_add_waitlist_signups/migration.sql',
        'docs/release/prelaunch-waitlist-readiness.md',
      ]),
    )
    expect(contract.checks).toEqual(
      expect.arrayContaining([
        'production-pepper-required',
        'waitlist-migration-contract',
        'rate-limit-and-retry-after',
        'safe-structured-logging',
        'public-copy-boundary',
        'pr-gate-integration',
      ]),
    )
  })

  it('keeps readiness evidence safe and wired into pr:gate', () => {
    expect(packageSource).toContain('qa:issue091:waitlist-readiness')
    expect(packageSource).toContain('pnpm qa:issue091:waitlist-readiness -- --mode=contract')
    expect(scriptSource).not.toContain('writeFileSync')
    expect(scriptSource).not.toContain('appendFileSync')
    expect(scriptSource).not.toContain('node:fs/promises')
    expect(scriptSource).not.toContain('.screenshot(')
    expect(scriptSource).not.toContain('accessibility.snapshot')
    expect(scriptSource).not.toContain('routeFromHAR')
    expect(scriptSource).toContain('consoleCallBlocks')
    expect(scriptSource).toContain('redacted-failure-output')
  })

  it('documents the human gates without recording secrets or operational overclaims', () => {
    expect(releaseDoc).toContain('WAITLIST_EMAIL_HASH_PEPPER')
    expect(releaseDoc).toContain('pnpm db:migrate:deploy')
    expect(releaseDoc).toContain('x-forwarded-for')
    expect(releaseDoc).toContain('privacy@hana.app')
    expect(releaseDoc).toContain('Do Not Record')
    expect(releaseDoc).toContain('secret 値')
    expect(releaseDoc).not.toContain('メール配信基盤は確定')
    expect(releaseDoc).not.toContain('法務確認済み')
  })

  it('records ISSUE-091 as the completed prelaunch validation readiness gate', () => {
    expect(issueSource).toContain('github_issue: 206')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('readiness QA が read-only')
    expect(issueIndexSource).toContain('Planned Prelaunch Validation Sequence')
    expect(issueIndexSource).toMatch(
      /\|\s*2\s*\|\s*`ISSUE-091`\s*\|\s*`#206`\s*\|\s*待機リスト公開前 readiness gate を追加する\s*\|\s*done\s*\|/,
    )
    expect(issueIndexSource).toContain('## Review Queue\n\n現在はありません。')
    expect(issueIndexSource).toContain(
      'prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`',
    )
  })
})
