import { describe, expect, it } from 'vitest'
import { toChildResponse, type ChildRow } from '@/features/children/view-models/child'

const baseRow: ChildRow = {
  id: '4a2c89b6-1234-4d8e-9abc-fedcba987654',
  userId: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
  name: 'はると',
  birthdate: new Date('2026-01-13T00:00:00Z'),
  avatarUrl: null,
  createdAt: new Date('2026-05-23T01:30:00Z'),
  updatedAt: new Date('2026-05-23T01:30:00Z'),
  deletedAt: null,
}

describe('toChildResponse', () => {
  it('produces snake_case API shape with date-only birthdate', () => {
    expect(toChildResponse(baseRow)).toEqual({
      id: '4a2c89b6-1234-4d8e-9abc-fedcba987654',
      name: 'はると',
      birthdate: '2026-01-13',
      avatar_url: null,
      created_at: '2026-05-23T01:30:00.000Z',
      updated_at: '2026-05-23T01:30:00.000Z',
    })
  })

  it('does not expose user_id or deleted_at', () => {
    const out = toChildResponse(baseRow) as Record<string, unknown>
    expect(out).not.toHaveProperty('user_id')
    expect(out).not.toHaveProperty('userId')
    expect(out).not.toHaveProperty('deleted_at')
    expect(out).not.toHaveProperty('deletedAt')
  })

  it('passes through avatar_url when present', () => {
    const out = toChildResponse({ ...baseRow, avatarUrl: 'https://example.com/a.jpg' })
    expect(out.avatar_url).toBe('https://example.com/a.jpg')
  })
})
