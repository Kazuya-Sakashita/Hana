import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const qaSource = readFileSync(
  new URL('../../../scripts/qa/issue-075-lp-public-qa.cjs', import.meta.url),
  'utf8',
)
const evaluationSource = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-099-lp-public-keepsake-asset.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const assetUrl = new URL('../../../public/lp/hana-public-keepsake-still-life.webp', import.meta.url)
const assetPath = fileURLToPath(assetUrl)

describe('ISSUE-099 LP public keepsake asset', () => {
  it('adds a lightweight generated bitmap asset for the public LP', async () => {
    expect(existsSync(assetPath)).toBe(true)
    const metadata = await sharp(assetPath).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(1440)
    expect(metadata.height).toBe(1080)
    expect(statSync(assetPath).size).toBeLessThan(260_000)
  })

  it('uses the public keepsake asset on the LP without weakening disclosure', () => {
    expect(lpSource).toContain('/lp/hana-public-keepsake-still-life.webp')
    expect(lpSource).not.toContain('/lp/hana-before-after-safe-still-life.svg')
    expect(lpSource).toContain('alt="合成の keepsake 静物ビジュアル"')
    expect(lpSource).toContain('公開前検証用の合成イメージです。実ユーザー写真ではありません。')
    expect(qaSource).toContain("const publicLpImage = '/lp/hana-public-keepsake-still-life.webp'")
  })

  it('records LP-P1-04 and issue state without adding private evidence', () => {
    expect(evaluationSource).toContain('LP-P1-04')
    expect(evaluationSource).toContain('対応済み。ISSUE-099')
    expect(evaluationSource).toContain('公開用 keepsake WebP asset')
    expect(issueSource).toContain('github_issue: 222')
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('文字なし、人物なし、実ユーザー写真なし')
    expect(issueIndexSource).toContain('`ISSUE-099`')
    expect(issueIndexSource).toContain('`#222`')
    expect(issueIndexSource).toContain('LP 公開用 keepsake 画像 asset を追加する')
    expect(`${lpSource}\n${issueSource}`).not.toMatch(
      /https?:\/\/|uploads\/|previewUrl|storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i,
    )
  })
})
