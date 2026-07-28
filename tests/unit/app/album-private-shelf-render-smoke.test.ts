import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumList } from '@/features/memories/client/album-list'
import type { Memory, MemoryListResponse } from '@/features/memories/client/use-memories'

const mocks = vi.hoisted(() => ({
  useInfiniteMemoriesQuery: vi.fn(),
  mutateAsync: vi.fn(),
  cancelQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('@/features/memories/client/use-memories', async () => ({
  memoriesQueryKey: ['memories'],
  useInfiniteMemoriesQuery: mocks.useInfiniteMemoriesQuery,
  useUpdateMemoryMutation: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: mocks.cancelQueries,
    invalidateQueries: mocks.invalidateQueries,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}))

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'memory-featured',
    child_id: 'child-synthetic',
    title: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    body: 'synthetic body '.repeat(12),
    recorded_at: '2026-07-24',
    weather: 'はれ',
    is_favorite: true,
    ai_generated: false,
    image_ids: ['image-synthetic'],
    cover_thumbnail_url: null,
    created_at: '2026-07-24T00:00:00.000Z',
    updated_at: '2026-07-24T00:00:00.000Z',
    ...overrides,
  }
}

function response(data: Memory[], nextCursor: string | null = null): MemoryListResponse {
  return {
    data,
    page: { next_cursor: nextCursor, total_count: data.length },
  }
}

const MAY_RANGE = {
  recordedFrom: '2026-05-01',
  recordedBefore: '2026-06-01',
}

describe('ISSUE-070 AlbumList rendered smoke', () => {
  beforeEach(() => {
    mocks.useInfiniteMemoriesQuery.mockImplementation(
      ({ initialData }: { initialData: MemoryListResponse }) => ({
        data: { pages: [initialData] },
        fetchNextPage: vi.fn(async () => ({
          isError: false,
          data: { pages: [initialData] },
        })),
        hasNextPage: Boolean(initialData.page.next_cursor),
        isError: false,
        isFetchingNextPage: false,
      }),
    )
  })

  it('keeps the featured memory available in the shelf list with favorite toggle', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlbumList, {
        initialData: response([memory()]),
        month: '2026-05',
        dateRange: MAY_RANGE,
      }),
    )

    expect(html).toContain('album-private-shelf')
    expect(html).toContain('album-shelf-heading')
    expect(html).toContain('album-shelf-item')
    expect(html).toContain('/memory/memory-featured')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="しるしを はずす"')
    expect(html).toContain('tap-target inline-flex size-11')
    expect(html).toContain('<h3')
    expect(html).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
  })

  it('renders load more status and control without page-level evidence data', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlbumList, {
        initialData: response([memory({ id: 'memory-001', is_favorite: false })], 'cursor-next'),
        month: '2026-05',
        dateRange: MAY_RANGE,
      }),
    )

    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('まえのページも みる')
    expect(html).toContain('w-full')
    expect(html).not.toMatch(/uploads\/|storage_key|presigned_url|prompt|previewUrl/i)
  })

  it('renders a non-judgmental empty state for a month without memories', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlbumList, {
        initialData: response([]),
        month: '2026-05',
        dateRange: MAY_RANGE,
      }),
    )

    expect(html).toContain('album-month-empty-state')
    expect(html).toContain('この月のページは、')
    expect(html).toContain('静かな余白です')
    expect(html).not.toMatch(/未記録|連続|達成|失敗/)
  })
})
