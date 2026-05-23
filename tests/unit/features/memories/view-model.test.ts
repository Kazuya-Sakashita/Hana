import { describe, expect, it } from 'vitest'
import { toMemoryResponse, type MemoryWithImages } from '@/features/memories/view-models/memory'

const baseRow: MemoryWithImages = {
  id: '7d6e5f4c-3b2a-4291-8765-0123456789ab',
  userId: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
  childId: '4a2c89b6-1234-4d8e-9abc-fedcba987654',
  title: 'はじめての すなあそび',
  body: 'すなを ぎゅっと にぎって、はじめての かんしょく。',
  recordedAt: new Date('2026-05-23T00:00:00Z'),
  weather: 'はれ',
  isFavorite: false,
  aiGenerated: false,
  createdAt: new Date('2026-05-23T11:00:00Z'),
  updatedAt: new Date('2026-05-23T11:00:00Z'),
  deletedAt: null,
  images: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', createdAt: new Date('2026-05-23T10:00:00Z') },
    { id: 'bbbbbbbb-0000-4000-8000-000000000002', createdAt: new Date('2026-05-23T10:00:30Z') },
  ],
}

describe('toMemoryResponse', () => {
  it('produces snake_case API shape', () => {
    expect(toMemoryResponse(baseRow)).toEqual({
      id: baseRow.id,
      child_id: baseRow.childId,
      title: baseRow.title,
      body: baseRow.body,
      recorded_at: '2026-05-23',
      weather: 'はれ',
      is_favorite: false,
      ai_generated: false,
      image_ids: ['aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002'],
      created_at: '2026-05-23T11:00:00.000Z',
      updated_at: '2026-05-23T11:00:00.000Z',
    })
  })

  it('sorts images by createdAt ascending (upload order)', () => {
    const out = toMemoryResponse({
      ...baseRow,
      images: [
        { id: 'late', createdAt: new Date('2026-05-23T10:00:30Z') },
        { id: 'early', createdAt: new Date('2026-05-23T10:00:00Z') },
      ],
    })
    expect(out.image_ids).toEqual(['early', 'late'])
  })

  it('does not expose user_id or deleted_at or storage_key', () => {
    const out = toMemoryResponse(baseRow) as Record<string, unknown>
    expect(out).not.toHaveProperty('user_id')
    expect(out).not.toHaveProperty('userId')
    expect(out).not.toHaveProperty('deleted_at')
    expect(out).not.toHaveProperty('deletedAt')
    expect(out).not.toHaveProperty('storage_key')
  })
})
