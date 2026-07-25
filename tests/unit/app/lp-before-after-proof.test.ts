import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const lpHtml = readFileSync(
  new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url),
  'utf8',
)
const evaluation = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-073-lp-before-after-proof.md', import.meta.url),
  'utf8',
)
const assetUrl = new URL(
  '../../../docs/design/artifacts/current-lp/hana-before-after-safe-still-life.svg',
  import.meta.url,
)

describe('ISSUE-073 LP Before / After proof', () => {
  it('adds a synthetic safe asset without introducing private evidence', () => {
    expect(existsSync(fileURLToPath(assetUrl))).toBe(true)
    expect(lpHtml).toContain('hana-before-after-safe-still-life.svg')
    expect(lpHtml).toContain('synthetic daily still-life visual')
    expect(lpHtml).toContain('実ユーザー写真ではありません')
    expect(lpHtml).toContain('合成の日常静物ビジュアル')
    expect(lpHtml).not.toMatch(/https?:\/\/|uploads\/|previewUrl/i)
    expect(lpHtml).not.toMatch(/storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i)
  })

  it('makes the value delta visible as photo only, title, and short body', () => {
    expect(lpHtml).toContain('写真だけと Hana で残した場合の比較')
    expect(lpHtml).toContain('写真のみ')
    expect(lpHtml).toContain('写真 + title')
    expect(lpHtml).toContain('写真 + 短い本文')
    expect(lpHtml).toContain('机の上の小さなくつした')
    expect(lpHtml).toContain('洗濯ものをたたむ前')
    expect(lpHtml).toContain('あとで開ける小さなページ')
    expect(lpHtml).toContain('人間レビュー済みの synthetic 例')
    expect(lpHtml).toContain('AI 生成本文や実ユーザー情報ではありません')
    expect(lpHtml).toContain('hana-before-after-safe-still-life.svg')
  })

  it('records ISSUE-073 as resolving LP-P0-02 while keeping other public gates visible', () => {
    expect(evaluation).toContain('ISSUE-073')
    expect(evaluation).toContain('LP-P0-02')
    expect(evaluation).toContain('対応済み')
    expect(evaluation).toContain('写真のみ → 写真 + title → 写真 + 短い本文')
    expect(evaluation).toContain('LP-P0-01')
    expect(evaluation).toContain('LP-P0-03')
  })

  it('keeps the issue evidence and review requirements explicit', () => {
    expect(issueSource).toMatch(/status: (review|done)/)
    expect(issueSource).toContain('github_issue: 164')
    expect(issueSource).toContain('- [x] Before / After が 3 秒で')
    expect(issueSource).toContain('- [x] 写真のみ、写真 + title、写真 + 短い本文')
    expect(issueSource).toContain('- [x] synthetic asset / copy')
    expect(issueSource).toContain('Product UX / Brand / Privacy')
  })
})
