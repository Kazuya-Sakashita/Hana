import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-056-home-quiet-heirloom-refresh.md', import.meta.url),
  'utf8',
)
const qaContract = readFileSync(
  new URL('../../../docs/design/home-quiet-heirloom-qa.md', import.meta.url),
  'utf8',
)
const screenshotScriptSource = readFileSync(
  new URL('../../../scripts/qa/issue-056-home-synthetic-screenshots.cjs', import.meta.url),
  'utf8',
)
const artifactPaths = [
  '../../../docs/design/artifacts/issue-056-home/home-empty-390x844.png',
  '../../../docs/design/artifacts/issue-056-home/home-one-memory-430x932.png',
  '../../../docs/design/artifacts/issue-056-home/home-five-memories-390x844.png',
  '../../../docs/design/artifacts/issue-056-home/home-five-memories-430x932.png',
  '../../../docs/design/artifacts/issue-056-home/home-five-memories-768x1024.png',
  '../../../docs/design/artifacts/issue-056-home/home-long-name-390x844.png',
]

const evidenceSources = {
  issueSource,
  qaContract,
  screenshotScriptSource,
}

function expectNoEvidenceLeaks() {
  const forbiddenPatterns = [
    /https?:\/\/(?!hana\.app\/problems\/)[^\s)`]+/i,
    /uploads\/[A-Za-z0-9_-]+\/\d{6}\/[0-9a-f-]+\.(jpg|jpeg|png|webp|heic)/i,
    /storage_key\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /presigned_url\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /prompt\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
    /やわらかい光|今日も元気|ちいさな手|公園に行きました/,
  ]

  for (const [name, source] of Object.entries(evidenceSources)) {
    for (const pattern of forbiddenPatterns) {
      expect(source, `${name} should not leak evidence matching ${pattern}`).not.toMatch(pattern)
    }
  }
}

describe('home Quiet Heirloom refresh', () => {
  it('keeps the record CTA clear without unrecorded-day pressure', () => {
    expect(homeSource).toContain('写真からページをつくる')
    expect(homeSource).toContain('アルバムをひらく')
    expect(homeSource).toContain('写真1まいから、AIの下書きまで')
    expect(homeSource).toContain('保存前に、ことばを整えられます。')
    expect(homeSource).toContain('whitespace-nowrap')
    expect(homeSource).toContain('30秒')
    expect(homeSource).toContain('const featuredMemory = memories[0] ?? null')
    expect(homeSource).toContain('FeaturedPhotoMat')
    expect(homeSource).toContain('また、ここに')
    expect(homeSource).toContain('しまいましょう')
    expect(homeSource).toContain('ひとことだけでも、静かに残せます。')
    expect(homeSource).not.toContain('あとで、ことばをなおせます')
    expect(homeSource).not.toContain('今日の {child.name} ちゃんを、のこしませんか')
    expect(homeSource).not.toMatch(/今日まだ|記録していません|途切れ|ストリーク|streak/i)
  })

  it('renders recent memories as private album slips instead of a feed', () => {
    expect(homeSource).toContain('data-testid="home-first-view-photo-mat"')
    expect(homeSource).toContain('写真をしまう場所')
    expect(homeSource).toContain('aspect-[4/3]')
    expect(homeSource).toContain('priority')
    expect(homeSource).toContain('shelfMemories')
    expect(homeSource).toContain('アルバム')
    expect(homeSource).toContain('最近のページたち')
    expect(homeSource).toContain('大きく見たページも、ここからまた開けます。')
    expect(homeSource).toContain('最近')
    expect(homeSource).toContain('paper-surface')
    expect(homeSource).toContain('photo-mat')
    expect(homeSource).toContain('snap-x')
    expect(homeSource).toContain('すべてのページを')
    expect(homeSource).not.toMatch(/いいね|ランキング|投稿|feed density/i)
  })

  it('keeps empty and stats states forgiving and non-competitive', () => {
    expect(homeSource).toContain('最初の1まいを、')
    expect(homeSource).toContain('ここにしまえます')
    expect(homeSource).toContain('はじめてのページをつくる')
    expect(homeSource).toContain('小さな余白')
    expect(homeSource).toContain('一緒に過ごした日数')
    expect(homeSource).toContain('HomeGentleStats')
    expect(homeSource).toContain('daysBetween(child.birthdate, new Date())')
    expect(homeSource).toContain('prisma.memory.count')
    expect(homeSource).toContain('select: { name: true, birthdate: true }')
    expect(homeSource).toContain('label="いまの月齢"')
    expect(homeSource).not.toContain('daysBetween(child.createdAt, new Date())')
    expect(homeSource).not.toMatch(/連続記録|今日で○日目|継続日数/)
  })

  it('keeps mobile accessibility hooks and privacy-safe image text', () => {
    expect(homeSource).toContain("from 'lucide-react'")
    expect(homeSource).toContain('<Camera')
    expect(homeSource).toContain('<BookOpen')
    expect(homeSource).toContain('<ChevronRight')
    expect(homeSource).toContain('alt=""')
    expect(homeSource).toContain('aria-hidden="true"')
    expect(homeSource).toContain('Button asChild')
    expect(homeSource).toContain('tap-target flex h-11 w-11')
    expect(homeSource).toContain('scroll-px-6')
    expect(homeSource).toContain('py-2')
    expect(homeSource).toContain('focus-visible:ring-2')
    expect(homeSource).toContain('[overflow-wrap:anywhere]')
    expect(homeSource).toContain('min-h-28')
  })

  it('records synthetic screenshot QA artifacts without real user data', () => {
    expect(qaContract).toContain('Synthetic Screenshot QA 状態')
    expect(qaContract).toContain('Synthetic Screenshot QA 結果')
    expect(qaContract).toContain('0 memories')
    expect(qaContract).toContain('5 memories')
    expect(qaContract).toContain('390x844')
    expect(qaContract).toContain('network HAR')
    expect(qaContract).toContain('accessibility snapshots')
    expect(qaContract).toContain('memory titles')
    expect(qaContract).toContain('storage_key')
    expect(qaContract).toContain('ISSUE-059')
    expect(qaContract).toContain('Do not use real child photos')
    expect(qaContract).toContain('memory titles, memory bodies, image URLs, storage keys')
    expect(screenshotScriptSource).toContain("evidence: 'synthetic-only'")
    expect(screenshotScriptSource).toContain('forbiddenEvidence')
    expectNoEvidenceLeaks()

    for (const artifactPath of artifactPaths) {
      const url = new URL(artifactPath, import.meta.url)
      expect(existsSync(url), `${artifactPath} should exist`).toBe(true)
      expect(statSync(url).size, `${artifactPath} should not be empty`).toBeGreaterThan(1000)
    }
  })
})
