import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-121-home-album-role-separation.md', import.meta.url),
  'utf8',
)

describe('ISSUE-121 Home and album role separation', () => {
  it('keeps one featured memory without rendering a duplicate horizontal shelf', () => {
    expect(homeSource).toContain('const featuredMemory = memories[0] ?? null')
    expect(homeSource).toContain('fetchMemoriesWithCovers({ userId, limit: 1 })')
    expect(homeSource).toContain('<FeaturedPhotoMat memory={featuredMemory} />')
    expect(homeSource).not.toContain('shelfMemories')
    expect(homeSource).not.toContain('overflow-x-auto')
    expect(homeSource).not.toContain('snap-x')
  })

  it('provides one compact album summary with the total page count', () => {
    expect(homeSource).toContain('最近のページ')
    expect(homeSource).toContain('<HomeAlbumSummary memoryCount={memoryCount} />')
    expect(homeSource).toContain('function HomeAlbumSummary')
    expect(homeSource).toContain('{memoryCount}ページ、しまってあります')
    expect(homeSource).toContain('月ごとに、これまでのページを見返せます。')
    expect(homeSource).toContain('href="/album"')
    expect(homeSource).not.toContain('アルバムをひらく')
    expect(homeSource).not.toMatch(/ランキング|順位|人気|feed|投稿|いいね/i)
  })

  it('keeps the summary responsive and keyboard visible', () => {
    expect(homeSource).toContain(
      'paper-surface ease-organic flex min-h-24 items-center justify-between',
    )
    expect(homeSource).toContain('focus-visible:ring-2')
    expect(homeSource).toContain('tap-target')
    expect(homeSource).toContain('QuietIcon icon={ChevronRight} tone="primary"')
    expect(homeSource).toContain('min-w-0')
  })

  it('tracks the issue scope and privacy boundary', () => {
    expect(issueSource).toContain('github_issue: 264')
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('ホームを「今、記録する場所」')
    expect(issueSource).toContain('API・OpenAPI・データ取得契約の変更')
    expect(issueSource).toContain('実写真、実タイトル、画像URL、`storage_key`、AI生成本文')
  })
})
