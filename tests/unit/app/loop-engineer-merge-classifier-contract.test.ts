import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> }
const contractDocument = readFileSync(
  new URL(
    '../../../docs/api-driven-development/loop-engineer-merge-classifier.md',
    import.meta.url,
  ),
  'utf8',
)
const runbook = readFileSync(
  new URL('../../../docs/api-driven-development/codex-automation-runbook.md', import.meta.url),
  'utf8',
)

describe('ISSUE-164 merge classifier repository contract', () => {
  it('exposes the read-only CLI and runs its contract mode in pr:gate', () => {
    expect(packageJson.scripts['loop-engineer:classify']).toBe(
      'node --import tsx scripts/loop-engineer/classify-merge-eligibility.ts',
    )
    expect(packageJson.scripts['qa:issue164:merge-classifier']).toBe(
      packageJson.scripts['loop-engineer:classify'],
    )
    expect(packageJson.scripts['pr:gate']).toContain(
      'pnpm qa:issue164:merge-classifier -- --mode=contract',
    )
  })

  it('documents the fixed schema, precedence, privacy boundary, and activation boundary', () => {
    expect(contractDocument).toContain('loop-engineer-merge-input/v1')
    expect(contractDocument).toContain('loop-engineer-merge-classification/v1')
    expect(contractDocument).toContain('loop-engineer-review-gate/v1')
    expect(contractDocument).toContain('HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE')
    expect(contractDocument).toContain('auth` → `security` → `security-authorization')
    expect(contractDocument).toContain('独立したread-only review')
    expect(contractDocument).toContain('reviewer間の判断不一致')
    expect(contractDocument).toContain('PR本文')
    expect(contractDocument).toContain('実ユーザーデータ')
    expect(contractDocument).toContain('自動マージを実行・予約しない')
    expect(contractDocument).toContain('64 KiB')
    expect(runbook).toContain('loop-engineer-merge-classifier.md')
    expect(runbook).toContain('pnpm qa:issue164:merge-classifier -- --mode=contract')
  })
})
