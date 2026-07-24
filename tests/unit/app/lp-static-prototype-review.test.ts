import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const lpHtmlUrl = new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url)
const lpAssetUrl = new URL(
  '../../../docs/design/artifacts/current-lp/hana-quiet-heirloom-concept-lp.webp',
  import.meta.url,
)
const evaluationUrl = new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url)
const issueUrl = new URL(
  '../../../docs/issues/ISSUE-071-lp-static-prototype-review.md',
  import.meta.url,
)

const lpHtml = readFileSync(lpHtmlUrl, 'utf8')
const evaluation = readFileSync(evaluationUrl, 'utf8')
const issueSource = readFileSync(issueUrl, 'utf8')

describe('ISSUE-071 LP static prototype review', () => {
  it('keeps the LP artifact self-contained and structured for review', () => {
    expect(existsSync(fileURLToPath(lpAssetUrl))).toBe(true)
    expect(lpHtml).toContain('hana-quiet-heirloom-concept-lp.webp')
    expect(lpHtml).toContain('<main id="top">')
    expect(lpHtml.match(/<h1\b/g) ?? []).toHaveLength(1)
    expect(lpHtml).toContain('name="viewport" content="width=device-width, initial-scale=1"')
    expect(lpHtml).toContain(':focus-visible')
    expect(lpHtml).toContain('prefers-reduced-motion')
  })

  it('connects the LP copy to conversion, value proof, AI consent, and store readiness', () => {
    expect(lpHtml).toContain('リリース通知を受け取る')
    expect(lpHtml).toContain('記録例を見る')
    expect(lpHtml).toContain('App Store 準備中')
    expect(lpHtml).toContain('Google Play 準備中')
    expect(lpHtml).toContain('同意していれば下書きを待つ')
    expect(lpHtml).toContain('AI は同意後だけ')
    expect(lpHtml).toContain('使わずに写真とことばだけで保存する道も残します')
    expect(lpHtml).not.toContain('ページの先頭へ')
  })

  it('keeps artifact evidence free of private image, URL, storage, prompt, and AI body leaks', () => {
    expect(lpHtml).not.toMatch(/https?:\/\/|uploads\/|previewUrl/i)
    expect(lpHtml).not.toMatch(/storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i)
    expect(lpHtml).not.toMatch(/学習に使いません|使われません|zero data retention|0-day|復元可能/i)
    expect(lpHtml).not.toMatch(/やわらかい光|今日も元気|ちいさな手|公園に行きました/)
  })

  it('records the expert framework review and follow-up issue split', () => {
    expect(evaluation).toContain('専門家サブエージェント評価')
    expect(evaluation).toContain('HEART / JTBD')
    expect(evaluation).toContain('LIFT / AIDA')
    expect(evaluation).toContain('Quiet Heirloom')
    expect(evaluation).toContain('WCAG / Nielsen')
    expect(evaluation).toContain('Privacy / Trust')
    expect(evaluation).toContain('LP-P0-01')
    expect(evaluation).toContain('LP-P0-02')
    expect(evaluation).toContain('LP-P0-03')

    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('github_issue: 162')
    expect(issueSource).toContain('- [x] 静的 LP prototype が作成されている')
    expect(issueSource).toContain('- [x] 専門サブエージェント 5 名の read-only review 結果')
    expect(issueSource).toContain('- [x] LP artifact に実写真、画像 URL、`storage_key`')
  })
})
