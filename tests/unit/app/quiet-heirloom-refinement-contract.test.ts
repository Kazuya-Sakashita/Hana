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
const publicSurfacePlanSource = readFileSync(
  new URL('../../../docs/design/public-surface-warmth-plan.md', import.meta.url),
  'utf8',
)
const issue084Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-084-public-privacy-trust-surface.md', import.meta.url),
  'utf8',
)
const issue085Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-085-lp-keepsake-journey-trust-bridge.md', import.meta.url),
  'utf8',
)
const issue086Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-086-public-surface-visual-qa-gate.md', import.meta.url),
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
    expect(issueIndexSource).toContain(
      '| 2     | `ISSUE-072` | `#163` | LP の実行可能な CV 導線を決めて接続               | done',
    )
    expect(issueIndexSource).toContain(
      '| 5     | `ISSUE-075` | `#166` | LP 公開前 QA と trust human review gate           | done',
    )
    expect(issueIndexSource).toContain(
      '| 1     | `ISSUE-084` | `#190` | /privacy を Quiet Heirloom trust surface に再設計する   | done',
    )
    expect(issueIndexSource).toMatch(
      /\|\s*1\s*\|\s*`ISSUE-089`\s*\|\s*`#202`\s*\|\s*待機リスト登録後の連絡期待値を明確にする\s*\|\s*done\s*\|/,
    )
    expect(issueIndexSource).toContain('## Blocked Or Needs Human Decision\n\n現在はありません。')
    expect(issueIndexSource).toContain(
      '## Review Queue\n\n- `ISSUE-099` / `#222`: PR 作成 / review / merge 待ち。',
    )
    expect(issueIndexSource).toContain(
      'prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`, `ISSUE-095`, `ISSUE-097`',
    )
    expect(issueIndexSource).toContain(
      '`ISSUE-088`, `ISSUE-090`, `ISSUE-092`, `ISSUE-094`, `ISSUE-096`, `ISSUE-098`',
    )
  })

  it('records the public surface warmth plan without weakening the prelaunch privacy hold', () => {
    expect(publicSurfacePlanSource).toContain('## 専門レビュー統合')
    expect(publicSurfacePlanSource).toContain('/privacy')
    expect(publicSurfacePlanSource).toContain('/lp')
    expect(publicSurfacePlanSource).toContain('ISSUE-075` の human review は 2026-07-26 に完了')

    expect(issue084Source).toContain('github_issue: 190')
    expect(issue084Source).toContain('status: done')
    expect(issue084Source).toContain('data-public-privacy')
    expect(issue084Source).toContain('未確認 claim')

    expect(issue085Source).toContain('github_issue: 191')
    expect(issue085Source).toContain('status: done')
    expect(issue085Source).toContain('フォーム前')
    expect(issue085Source).toContain('AI 同意')

    expect(issue086Source).toContain('github_issue: 192')
    expect(issue086Source).toMatch(/status: (in_progress|review|done)/)
    expect(issue086Source).toContain('blocked_by:')
    expect(issue086Source).toContain('ISSUE-084')
    expect(issue086Source).toContain('ISSUE-085')

    expect(issueIndexSource).toContain('Planned Public Surface Warmth Sequence')
    expect(publicSurfacePlanSource).toContain(
      '| `ISSUE-085` | `/lp` を keepsake journey と public trust bridge へ寄せる | done',
    )
    expect(publicSurfacePlanSource).toContain(
      '| `ISSUE-086` | Public LP / Privacy visual QA gate を拡張する             | done',
    )
    expect(issueIndexSource).toContain(
      '| 3     | `ISSUE-086` | `#192` | Public LP / Privacy visual QA gate を拡張する           | done',
    )
    expect(issueIndexSource).toContain('## Blocked Or Needs Human Decision\n\n現在はありません。')
  })
})
