import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const albumPageSource = readFileSync(
  new URL('../../../src/app/album/page.tsx', import.meta.url),
  'utf8',
)
const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const memoryDetailSource = readFileSync(
  new URL('../../../src/app/memory/[memoryId]/page.tsx', import.meta.url),
  'utf8',
)
const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)
const qaContract = readFileSync(
  new URL('../../../docs/design/album-memory-keepsake-qa.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-057-album-memory-keepsake-refresh.md', import.meta.url),
  'utf8',
)

const evidenceSources = {
  albumPageSource,
  albumListSource,
  memoryDetailSource,
  memoryActionsSource,
  qaContract,
  issueSource,
}

function expectNoEvidenceLeaks() {
  const forbiddenPatterns = [
    /https?:\/\/(?!hana\.app\/problems\/)[^\s)`]+/i,
    /uploads\/[A-Za-z0-9_-]+\/\d{6}\/[0-9a-f-]+\.(jpg|jpeg|png|webp|heic)/i,
    /storage_key\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /previewUrl\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /presigned_url\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /prompt\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
  ]
  const aiBodyFragments = [
    'やわらかい' + '光',
    '今日も' + '元気',
    'ちいさな' + '手',
    '公園に' + '行きました',
  ]

  for (const [name, source] of Object.entries(evidenceSources)) {
    for (const pattern of forbiddenPatterns) {
      expect(source, `${name} should not leak evidence matching ${pattern}`).not.toMatch(pattern)
    }
    for (const fragment of aiBodyFragments) {
      expect(source, `${name} should not leak AI body-like fragment`).not.toContain(fragment)
    }
  }
}

describe('album and memory keepsake refresh', () => {
  it('renders album as a private shelf without feed or ranking language', () => {
    expect(albumPageSource).toContain('しまってあるページ')
    expect(albumPageSource).toContain('しまったページを、静かに読み返せます。')
    expect(albumPageSource).toContain('写真から のこす')
    expect(albumListSource).toContain('paper-surface')
    expect(albumListSource).toContain('photo-mat')
    expect(albumListSource).toContain('BookOpen')
    expect(albumListSource).not.toMatch(/いいね|ランキング|投稿|ストリーク|streak/i)
    expect(albumPageSource).not.toContain('Card')
  })

  it('keeps pagination and favorite optimistic behavior intact', () => {
    expect(albumListSource).toContain('useInfiniteMemoriesQuery')
    expect(albumListSource).toContain('query.fetchNextPage()')
    expect(albumListSource).toContain('quietStateCopy.album.loadMoreButton')
    expect(albumListSource).toContain('statusRef.current?.focus')
    expect(albumListSource).toContain('optimisticUpdateMemoryInLists')
    expect(albumListSource).toContain('rollback()')
    expect(albumListSource).toContain('aria-pressed={memory.is_favorite}')
    expect(albumListSource).toContain('しるしを つける')
    expect(albumListSource).toContain('tap-target flex h-11 w-11')
  })

  it('keeps memory detail photo and story primary with privacy-safe alt text', () => {
    expect(memoryDetailSource).toContain('photo-mat space-y-3')
    expect(memoryDetailSource).toContain('const [heroImage, ...additionalImages]')
    expect(memoryDetailSource).toContain('memory-additional-photos')
    expect(memoryDetailSource).toContain('additionalImages.length > 0')
    expect(memoryDetailSource).toContain('alt="記録のしゃしん"')
    expect(memoryDetailSource).toContain('leading-bookish')
    expect(memoryDetailSource).toContain('[overflow-wrap:anywhere]')
    expect(memoryDetailSource).toContain('MemoryActions')
    expect(memoryDetailSource).toContain('tap-target absolute')
    expect(memoryDetailSource).not.toContain('tracking-tight')
    expect(memoryDetailSource).not.toContain('alt=""')
  })

  it('keeps detail actions quiet and delete trust contract intact', () => {
    expect(memoryActionsSource).toContain('ページのしるしと操作')
    expect(memoryActionsSource).toContain('label="しるし"')
    expect(memoryActionsSource).toContain('pressed={isFavorite}')
    expect(memoryActionsSource).toContain(
      "aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}",
    )
    expect(memoryActionsSource).not.toContain('label="なおす"')
    expect(memoryActionsSource).toContain('しるしと削除だけ操作できます')
    expect(memoryActionsSource).not.toContain('ことばの編集は、準備中です。')
    expect(memoryActionsSource).toContain('deleteMemoryDescription(childName)')
    expect(memoryActionsSource).not.toContain('もどせます')
    expect(memoryActionsSource).not.toContain('復元')
    expect(memoryActionsSource).not.toContain('7日')
  })

  it('records QA evidence rules for privacy-safe review', () => {
    expect(qaContract).toContain('API、pagination、削除 restore promise は変更しない')
    expect(qaContract).toContain('51 or more memories')
    expect(qaContract).toContain('Detail with photo and body')
    expect(qaContract).toContain('Detail with multiple photos')
    expect(qaContract).toContain('Long title/body on 390px')
    expect(qaContract).toContain('ISSUE-059')
    expect(qaContract).toContain('実写真、実名、実タイトル、実本文')
    expect(qaContract).toContain('storage_key 実値')
    expect(qaContract).toContain('signed image URL')
    expect(qaContract).toContain('previewUrl')
    expectNoEvidenceLeaks()
  })
})
