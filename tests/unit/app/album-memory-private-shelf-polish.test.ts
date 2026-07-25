import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-081-album-memory-private-shelf-polish.md', import.meta.url),
  'utf8',
)

describe('ISSUE-081 Album / Memory Detail private shelf polish', () => {
  it('makes the album shelf read as a quiet private shelf, not a feed', () => {
    expect(albumListSource).toContain('data-testid="album-shelf-heading"')
    expect(albumListSource).toContain('data-testid="album-shelf-list"')
    expect(albumListSource).toContain('data-testid="album-shelf-item"')
    expect(albumListSource).toContain('一冊ずつ静かに並びます。')
    expect(albumListSource).toContain('QuietIcon icon={BookOpen} tone="muted"')
    expect(albumListSource).not.toMatch(/いいね|ランキング|投稿|フィード|feed|ranking/i)
  })

  it('keeps favorite as a quiet personal mark with the existing optimistic behavior', () => {
    expect(albumListSource).toContain('QuietIconButton')
    expect(albumListSource).toContain('icon={Heart}')
    expect(albumListSource).toContain('tone="favorite"')
    expect(albumListSource).toContain('active={memory.is_favorite}')
    expect(albumListSource).toContain('aria-pressed={memory.is_favorite}')
    expect(albumListSource).toContain('optimisticUpdateMemoryInLists')
    expect(albumListSource).toContain('rollback()')
  })

  it('keeps memory detail reading-first while making saved notice and actions quiet', () => {
    expect(memoryDetailSource).toContain('data-testid="memory-saved-notice"')
    expect(memoryDetailSource).toContain('PaperSlip')
    expect(memoryDetailSource).toContain('QuietIcon icon={CheckCircle2} tone="primary"')
    expect(memoryActionsSource).toContain('data-testid="memory-quiet-action-band"')
    expect(memoryActionsSource).toContain('aria-labelledby="memory-actions-title"')
    expect(memoryActionsSource).toContain('QuietIconButton')
    expect(memoryActionsSource).toContain(
      "label={isFavorite ? 'しるしを はずす' : 'しるしを つける'}",
    )
    expect(memoryActionsSource).toContain('label="このページを けす"')
    expect(memoryActionsSource).toContain('aria-describedby="memory-edit-note"')
    expect(memoryActionsSource).not.toContain('grid grid-cols-2')
    expect(memoryActionsSource).not.toContain('min-h-16')
  })

  it('keeps delete confirmation within the existing trust contract', () => {
    expect(memoryActionsSource).toContain('StatePanel')
    expect(memoryActionsSource).toContain('deleteMemoryDescription(childName)')
    expect(memoryActionsSource).not.toContain('Card')
    expect(memoryActionsSource).not.toContain('復元')
    expect(memoryActionsSource).not.toContain('完全削除')
    expect(memoryActionsSource).not.toContain('保持期間')
  })

  it('records issue scope and evidence safety', () => {
    expect(issueSource).toContain('github_issue: 181')
    expect(issueSource).toContain('Auth / Storage / DB / OpenAPI の変更')
    expect(issueSource).toContain('pagination API、delete API、favorite API の変更')
    expect(issueSource).toContain(
      '実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メール',
    )
  })
})
