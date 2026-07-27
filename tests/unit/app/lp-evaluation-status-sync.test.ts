import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const evaluationSource = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-097-lp-evaluation-status-sync.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

const nextRecommendation = evaluationSource.slice(
  evaluationSource.indexOf('## 次の推奨順'),
  evaluationSource.indexOf('## ISSUE-072 CV 導線更新'),
)

describe('ISSUE-097 LP evaluation status sync', () => {
  it('marks relevance and trust-detail gaps as resolved by ISSUE-093', () => {
    expect(evaluationSource).toContain('LP-P1-02')
    expect(evaluationSource).toContain('対応済み。ISSUE-093 で hero 支持文')
    expect(evaluationSource).toContain('relevance pills')
    expect(evaluationSource).toContain('LP-P1-05')
    expect(evaluationSource).toContain('対応済み。ISSUE-093 で `/privacy`')
    expect(evaluationSource).toContain('停止・削除 anchor')
  })

  it('keeps next recommendations focused on unresolved validation operations', () => {
    expect(nextRecommendation).toContain('公開前検証 traffic 直前')
    expect(nextRecommendation).toContain('redacted aggregate')
    expect(nextRecommendation).toContain('privacy/legal review')
    expect(nextRecommendation).toContain('LP-P2-02` まで対応済み')
    expect(nextRecommendation).not.toContain('LP-P1-02')
    expect(nextRecommendation).not.toContain('LP-P1-05')
  })

  it('records the local issue and review queue state without adding product-surface scope', () => {
    expect(issueSource).toContain('github_issue: 218')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('Issue Index が `ISSUE-097` / `#218` の done 状態')
    expect(issueSource).toContain('LP 本体の追加変更')
    expect(issueIndexSource).toContain('`ISSUE-097`')
    expect(issueIndexSource).toContain('`#218`')
    expect(issueIndexSource).toContain('LP 評価表の relevance と trust 完了状態を同期する')
    expect(issueIndexSource).toContain(
      '## Review Queue\n\n- `ISSUE-101` / `#226`: PR 作成 / review / merge 待ち。',
    )
    expect(issueIndexSource).toContain(
      'prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`, `ISSUE-095`, `ISSUE-097`, `ISSUE-099`',
    )
  })
})
