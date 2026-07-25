import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const lpHtmlUrl = new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url)
const lpProofAssetUrl = new URL(
  '../../../docs/design/artifacts/current-lp/hana-before-after-safe-still-life.svg',
  import.meta.url,
)
const evaluationUrl = new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url)
const issueUrl = new URL('../../../docs/issues/ISSUE-073-lp-before-after-proof.md', import.meta.url)

const lpHtml = readFileSync(lpHtmlUrl, 'utf8')
const lpProofAssetSource = readFileSync(lpProofAssetUrl, 'utf8')
const evaluation = readFileSync(evaluationUrl, 'utf8')
const issueSource = readFileSync(issueUrl, 'utf8')
const beforeAfterSection = lpHtml.match(/<section id="value"[\s\S]*?<section id="flow"/)?.[0] ?? ''

describe('ISSUE-073 LP before after proof', () => {
  it('uses a local safe synthetic asset for the before and after comparison', () => {
    expect(existsSync(fileURLToPath(lpProofAssetUrl))).toBe(true)
    expect(lpHtml).toContain('hana-before-after-safe-still-life.svg')
    expect(lpHtml.match(/hana-before-after-safe-still-life\.svg/g) ?? []).toHaveLength(3)
    expect(beforeAfterSection.match(/hana-before-after-safe-still-life\.svg/g) ?? []).toHaveLength(
      2,
    )
    expect(lpHtml).toContain('合成サンプル')
    expect(lpHtml).toContain('実データなし')
    expect(lpHtml).toContain('合成アセットと人間作成の短い例文')
    expect(lpProofAssetSource).toContain('<svg')
    expect(lpProofAssetSource).not.toMatch(/href=|xlink:href=|uploads\/|storage_key|presigned_url/i)
  })

  it('makes the value difference understandable as photo, title, and short copy', () => {
    expect(lpHtml).toContain('写真だけ')
    expect(lpHtml).toContain('Hana で残すと')
    expect(lpHtml).toContain('画像と撮影日')
    expect(lpHtml).toContain('タイトル')
    expect(lpHtml).toContain('短いことば')
    expect(lpHtml).toContain('まるいおもちゃの日')
    expect(lpHtml).toContain('片づける前の布の上に、小さな靴下と木のおもちゃ。')
  })

  it('keeps proof evidence explicit and private-data free', () => {
    expect(lpHtml).not.toMatch(
      /uploads\/|previewUrl|storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i,
    )
    expect(lpHtml).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    expect(lpHtml).not.toContain('name@example.com')
    expect(lpProofAssetSource).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    expect(evaluation).toContain('ISSUE-073 Before / After 更新')
    expect(evaluation).toContain('人間作成の synthetic 例')
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('- [x] Before / After が 3 秒で')
  })
})
