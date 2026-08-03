import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> }
const contractDocument = readFileSync(
  new URL(
    '../../../docs/api-driven-development/loop-engineer-specialist-review-gate.md',
    import.meta.url,
  ),
  'utf8',
)
const runbook = readFileSync(
  new URL('../../../docs/api-driven-development/codex-automation-runbook.md', import.meta.url),
  'utf8',
)
const issueDocument = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-165-loop-engineer-specialist-review-gate.md',
    import.meta.url,
  ),
  'utf8',
)

describe('ISSUE-165 specialist review gate repository contract', () => {
  it('exposes a read-only CLI and runs its contract in pr:gate', () => {
    expect(packageJson.scripts['loop-engineer:review']).toBe(
      'node --import tsx scripts/loop-engineer/evaluate-specialist-reviews.ts',
    )
    expect(packageJson.scripts['qa:issue165:specialist-review']).toBe(
      packageJson.scripts['loop-engineer:review'],
    )
    expect(packageJson.scripts['pr:gate']).toContain(
      'pnpm qa:issue165:specialist-review -- --mode=contract',
    )
  })

  it('documents independent latest-SHA reviews, waves, fail-closed reasons, and privacy', () => {
    for (const text of [
      'loop-engineer-review-input/v1',
      'loop-engineer-review-evaluation/v1',
      'loop-engineer-review-gate/v1',
      'Spec / Acceptance',
      'Implementation / Correctness',
      'Test / Reliability',
      'read-only',
      '独立コンテキスト',
      'wave',
      '最大3巡',
      'review_sha_mismatch',
      'reviewer_timeout',
      'actionable_findings_present',
      '64 KiB',
      'PR本文',
      '実ユーザーデータ',
      'prompt',
      'secret',
    ]) {
      expect(contractDocument).toContain(text)
    }
    expect(runbook).toContain('loop-engineer-specialist-review-gate.md')
    expect(runbook).toContain('pnpm qa:issue165:specialist-review -- --mode=contract')
  })

  it('keeps ISSUE-165 review-ready with every acceptance criterion checked', () => {
    expect(issueDocument).toContain('github_issue: 337')
    expect(issueDocument).toContain('status: review')
    expect(issueDocument).not.toContain('- [ ]')
    expect(issueDocument).toContain('OpenAPI、DB、Storage、実環境には影響しない')
  })
})
