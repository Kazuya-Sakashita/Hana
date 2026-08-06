import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-105-staging-preflight-go-hold.md', import.meta.url),
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
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')

describe('ISSUE-105 staging preflight hold state', () => {
  it('records the external blockers and required human review', () => {
    expect(issueSource).toContain('github_issue: 234')
    expect(issueSource).toContain('status: blocked')
    expect(issueSource).toContain('staging_hosting_target')
    expect(issueSource).toContain('staging_secret_configuration')
    expect(issueSource).toContain('staging_migration_status')
    expect(issueSource).toContain('proxy_and_rate_limit_confirmation')
    expect(issueSource).toContain('privacy_mailbox_confirmation')
    expect(issueSource).toContain('requires_human_review:')
    expect(issueSource).toContain('  - release')
    expect(issueSource).toContain('  - security')
    expect(issueSource).toContain('  - privacy')
  })

  it('keeps the current decision at hold without recording sensitive values', () => {
    expect(issueSource).toContain('**HOLD**')
    expect(issueSource).toContain('env 値は出力していない')
    expect(issueSource).toContain('local-only。staging 設定とは扱わない')
    expect(issueSource).not.toMatch(/postgresql:\/\//i)
    expect(issueSource).not.toMatch(/WAITLIST_EMAIL_HASH_PEPPER\s*=/)
    expect(issueSource).toContain('privacy@hana.app')
  })

  it('keeps the release gate wired and documents hold by default', () => {
    expect(packageSource).toContain('qa:issue103:prelaunch-traffic')
    expect(releaseDoc).toContain('未確認なら `HOLD`')
    expect(releaseDoc).toContain('外部状態を自動確認したことにはならない')
    expect(releaseDoc).toContain('production では `--target=production`')
  })

  it('syncs the blocked state into the issue index', () => {
    expect(issueIndexSource).toContain('| `blocked` | 8 |')
    expect(issueIndexSource).toContain('| `ISSUE-105` | `#234` | `blocked` |')
    expect(issueIndexSource).toContain(
      'staging preflight を実行し公開前 traffic の Go/Hold を判定する',
    )
  })
})
