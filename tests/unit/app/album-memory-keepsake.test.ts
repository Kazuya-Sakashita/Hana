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
const memoryEditPageSource = readFileSync(
  new URL('../../../src/app/memory/[memoryId]/edit/page.tsx', import.meta.url),
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
    expect(albumPageSource).not.toContain('data-testid="album-featured-page"')
    expect(albumPageSource).not.toContain('この月の一ページ')
    expect(albumPageSource).not.toContain('const featured = items[0] ?? null')
    expect(albumPageSource).toContain('data: items.map')
    expect(albumListSource).toContain('paper-surface')
    expect(albumListSource).toContain('photo-mat')
    expect(albumListSource).toContain('album-private-shelf')
    expect(albumListSource).toContain('album-shelf-heading')
    expect(albumListSource).toContain('この月のページ')
    expect(albumListSource).toContain('formatAlbumMonth(month)')
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
    expect(albumListSource).toContain('label={`${memory.title} の しるし`}')
    expect(albumListSource).toContain('QuietIconButton')
    expect(albumListSource).toContain('active={memory.is_favorite}')
    expect(albumListSource).toContain('AlbumFavoriteButton')
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
    expect(memoryDetailSource).toContain('ことばと天気を なおす')
    expect(memoryDetailSource).toContain('href={`/memory/${encodeURIComponent(memory.id)}/edit`}')
    expect(memoryEditPageSource).toContain('<Link href={detailPath} replace')
    expect(memoryDetailSource).toContain('tap-target absolute')
    expect(memoryDetailSource).toContain('data-testid="memory-saved-notice"')
    expect(memoryDetailSource).toContain('PaperSlip')
    expect(memoryDetailSource).not.toContain('paper-surface mb-4')
    expect(memoryDetailSource).not.toContain('tracking-tight')
    expect(memoryDetailSource).not.toContain('alt=""')
  })

  it('keeps detail actions quiet and delete trust contract intact', () => {
    expect(memoryActionsSource).toContain('ページの操作')
    expect(memoryActionsSource).toContain('data-testid="memory-quiet-action-band"')
    expect(memoryActionsSource).toContain('QuietIconButton')
    expect(memoryActionsSource).toContain(
      "label={isFavorite ? 'しるしを はずす' : 'しるしを つける'}",
    )
    expect(memoryActionsSource).toContain('label="このページを けす"')
    expect(memoryActionsSource).toContain('aria-label="ことばと天気を なおす"')
    expect(memoryActionsSource).toContain('href={`/memory/${encodeURIComponent(memoryId)}/edit`}')
    expect(memoryActionsSource).toContain('aria-pressed={isFavorite}')
    expect(memoryActionsSource).toContain('aria-describedby="memory-edit-note"')
    expect(memoryActionsSource).toContain('ことばと天気を整えたり、しるしと削除を操作できます')
    expect(memoryActionsSource).not.toContain('ことばの編集は、準備中です。')
    expect(memoryActionsSource).toContain('deleteMemoryDescription(childName)')
    expect(memoryActionsSource).toContain('StatePanel')
    expect(memoryActionsSource).not.toContain('Card')
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
