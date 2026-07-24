import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const canonSource = readFileSync(
  new URL('../../../docs/design/quiet-heirloom-design-canon.md', import.meta.url),
  'utf8',
)
const qaSource = readFileSync(
  new URL('../../../docs/design/product-design-qa-v2.md', import.meta.url),
  'utf8',
)
const issue066Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-066-quiet-heirloom-refinement-contract.md', import.meta.url),
  'utf8',
)
const issue067Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-067-token-common-ui-texture-refinement.md', import.meta.url),
  'utf8',
)
const issue068Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-068-home-photo-first-view-refinement.md', import.meta.url),
  'utf8',
)
const issue069Source = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-069-record-one-decision-sheet-refinement.md',
    import.meta.url,
  ),
  'utf8',
)
const issue070Source = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-070-album-memory-private-shelf-refinement.md',
    import.meta.url,
  ),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

describe('ISSUE-066 Quiet Heirloom refinement contract', () => {
  it('defines sage and sakura as separate semantic roles', () => {
    expect(canonSource).toContain('## ISSUE-066 Refinement Contract')
    expect(canonSource).toContain('### Color Semantics')
    expect(canonSource).toContain('sage / leaf')
    expect(canonSource).toContain('記録・保存・完了')
    expect(canonSource).toContain('sakura')
    expect(canonSource).toContain('装飾・しるし・小さな感情アクセント')
    expect(canonSource).toContain('大きな面の CTA')
  })

  it('locks the material, radius, shadow, and ornament rules for follow-up UI work', () => {
    expect(canonSource).toContain('### Material And Radius Taxonomy')
    expect(canonSource).toContain('photo-inner')
    expect(canonSource).toContain('10-12px')
    expect(canonSource).toContain('photo-mat')
    expect(canonSource).toContain('14-16px')
    expect(canonSource).toContain('paper-slip')
    expect(canonSource).toContain('16-20px')
    expect(canonSource).toContain('sheet')
    expect(canonSource).toContain('20-24px')
    expect(canonSource).toContain('### Shadow And Hairline')
    expect(canonSource).toContain('### Ornament Rules')
    expect(canonSource).toContain('aria-hidden')
    expect(canonSource).not.toContain('baby sticker を推奨')
  })

  it('adds visual refinement QA without weakening evidence safety', () => {
    expect(qaSource).toContain('## ISSUE-066 Refinement QA Addendum')
    expect(qaSource).toContain('photo mat primacy')
    expect(qaSource).toContain('sage primary action')
    expect(qaSource).toContain('sakura restraint')
    expect(qaSource).toContain('one-decision record')
    expect(qaSource).toContain('private shelf album')
    expect(qaSource).toContain('trust density')
    expect(qaSource).toContain('実写真、production data、画像 URL、signed URL')
    expect(qaSource).toContain('`storage_key`、prompt、AI 生成本文を残さない')
    expect(qaSource).toContain('OpenAPI / DB / 認証 / Storage 変更を伴わない')
  })

  it('records the local issue plan and dependency chain for ISSUE-066 through ISSUE-070', () => {
    expect(issue066Source).toContain('github_issue: 152')
    expect(issue066Source).toContain('status: done')
    expect(issue066Source).toContain('- [x] Quiet Heirloom の refinement 方針')
    expect(issue066Source).toContain('OpenAPI / DB / 認証 / Storage の変更が不要')

    expect(issue067Source).toContain('github_issue: 153')
    expect(issue067Source).toContain('status: done')
    expect(issue067Source).toContain('blocked_by:')
    expect(issue067Source).toContain('ISSUE-066')
    expect(issue068Source).toContain('github_issue: 154')
    expect(issue068Source).toContain('ISSUE-067')
    expect(issue069Source).toContain('github_issue: 155')
    expect(issue069Source).toContain('ISSUE-067')
    expect(issue070Source).toContain('github_issue: 156')
    expect(issue070Source).toContain('ISSUE-067')
  })

  it('updates the issue index with the refinement sequence and ready follow-up state', () => {
    expect(issueIndexSource).toContain('Planned Quiet Heirloom Refinement Sequence')
    expect(issueIndexSource).toContain('| 1     | `ISSUE-066` | Quiet Heirloom refinement 設計契約')
    expect(issueIndexSource).toContain('| 2     | `ISSUE-067` | トークンと共通 UI の質感調整')
    expect(issueIndexSource).toContain('| 3     | `ISSUE-068` | ホーム first view を写真主役へ調整')
    expect(issueIndexSource).toContain(
      '| 4     | `ISSUE-069` | 記録画面を 1 判断ずつの下部シート体験へ調整',
    )
    expect(issueIndexSource).toContain(
      '| 5     | `ISSUE-070` | アルバムと記録詳細を private shelf 体験へ調整 | done',
    )
    expect(issueIndexSource).toContain('done')
    expect(issueIndexSource).toContain('## Codex Ready Queue\n\n現在はありません。')
    expect(issueIndexSource).not.toContain('todo, ready')
    expect(issueIndexSource).not.toContain('todo, blocked by `ISSUE-067`')
    expect(issueIndexSource).toContain('Planned LP Public Readiness Sequence')
    expect(issueIndexSource).toContain('| 1     | `ISSUE-071` | `#162`')
    expect(issueIndexSource).toContain('| 5     | `ISSUE-075` | `#166`')
    expect(issueIndexSource).toContain('## Review Queue')
    expect(issueIndexSource).toContain('`ISSUE-072`')
    expect(issueIndexSource).toContain('待機リスト導線・API・保存先実装済み')
  })
})
