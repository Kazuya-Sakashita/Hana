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

  it('keeps completed refinement work and current queues in the generated issue index', () => {
    for (const issueId of [
      'ISSUE-066',
      'ISSUE-067',
      'ISSUE-068',
      'ISSUE-069',
      'ISSUE-070',
      'ISSUE-071',
      'ISSUE-072',
      'ISSUE-075',
      'ISSUE-084',
      'ISSUE-089',
    ]) {
      const row = issueIndexSource.split('\n').find((line) => line.startsWith(`| \`${issueId}\` |`))
      expect(row).toContain('| `done` |')
    }
    expect(issueIndexSource).toContain('## Codex Ready Queue')
    expect(issueIndexSource).toContain('| `ISSUE-150` | `#320` | `todo` |')
    expect(issueIndexSource).toContain('## Blocked Or Needs Human Decision')
    expect(issueIndexSource).toContain('| `ISSUE-105` | `#234` | `blocked` |')
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

    expect(publicSurfacePlanSource).toContain(
      '| `ISSUE-085` | `/lp` を keepsake journey と public trust bridge へ寄せる | done',
    )
    expect(publicSurfacePlanSource).toContain(
      '| `ISSUE-086` | Public LP / Privacy visual QA gate を拡張する             | done',
    )
    expect(issueIndexSource).toContain('| `ISSUE-086` | `#192` | `done` |')
    expect(issueIndexSource).toContain('| `ISSUE-105` | `#234` | `blocked` |')
  })
})
