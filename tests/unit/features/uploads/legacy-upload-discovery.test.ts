import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { discoverLegacyUnconfirmedUploads } from '@/features/uploads/server/legacy-upload-discovery'

const NOW = new Date('2026-07-31T12:00:00.000Z')
const USER_ID = '10000000-0000-4000-8000-000000000001'
const HASH = createHash('sha256').update(USER_ID).digest('hex').slice(0, 16)
const ORIGINAL = '10000000-0000-4000-8000-000000000002.jpg'
const OLD = '2026-07-28T00:00:00.000Z'

function database() {
  const createMany = vi.fn().mockResolvedValue({ count: 1 })
  return {
    client: {
      profile: {
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            where?.id && typeof where.id === 'object' && 'gt' in where.id ? null : { id: USER_ID },
          ),
      },
      maintenanceCursor: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      image: { findFirst: vi.fn().mockResolvedValue(null) },
      uploadReservation: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany,
      },
    } as unknown as PrismaClient,
    createMany,
  }
}

describe('legacy unconfirmed upload discovery', () => {
  it('keeps discovery read-only in dry-run and scopes listing to an active user prefix', async () => {
    const db = database()
    const list = vi.fn().mockImplementation(async (path: string, offset: number) => {
      if (path === `uploads/${HASH}`) {
        return offset === 0
          ? [{ name: '202607', createdAt: null, updatedAt: null, isFolder: true }]
          : []
      }
      return [{ name: ORIGINAL, createdAt: OLD, updatedAt: OLD, isFolder: false }]
    })

    const result = await discoverLegacyUnconfirmedUploads(db.client, { list }, NOW, false)

    expect(result).toEqual({
      legacyScanned: 1,
      legacyDiscovered: 1,
      legacyInvalid: 0,
      legacyListFailed: 0,
    })
    expect(list).toHaveBeenCalledWith(`uploads/${HASH}`, 0)
    expect(db.createMany).not.toHaveBeenCalled()
  })

  it('persists a second observation window and never registers variants or unknown names', async () => {
    const db = database()
    const list = vi.fn().mockImplementation(async (path: string, offset: number) => {
      if (path === `uploads/${HASH}`) {
        return offset === 0
          ? [{ name: '202607', createdAt: null, updatedAt: null, isFolder: true }]
          : []
      }
      return [
        {
          name: ORIGINAL.replace('.jpg', '_thumb.webp'),
          createdAt: OLD,
          updatedAt: OLD,
          isFolder: false,
        },
        { name: '../outside.jpg', createdAt: OLD, updatedAt: OLD, isFolder: false },
      ]
    })

    const result = await discoverLegacyUnconfirmedUploads(db.client, { list }, NOW, true)

    expect(result).toEqual({
      legacyScanned: 1,
      legacyDiscovered: 1,
      legacyInvalid: 1,
      legacyListFailed: 0,
    })
    expect(db.createMany).toHaveBeenCalledOnce()
    const data = db.createMany.mock.calls[0]?.[0].data[0]
    expect(data.storageKey).toBe(`uploads/${HASH}/202607/${ORIGINAL}`)
    expect(data.candidateKind).toBe('variant_only')
    expect(data.cleanupAfter).toEqual(new Date('2026-08-02T12:00:00.000Z'))
  })

  it('resumes at the persisted object offset beyond the first 1000 entries', async () => {
    let cursorValue: string | null = null
    const createMany = vi.fn().mockResolvedValue({ count: 1 })
    const client = {
      maintenanceCursor: {
        findUnique: vi.fn().mockImplementation(async () => (cursorValue ? { cursorValue } : null)),
        upsert: vi.fn().mockImplementation(async ({ create, update }) => {
          cursorValue = (cursorValue ? update : create).cursorValue
          return { cursorValue }
        }),
      },
      profile: {
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            where?.id && typeof where.id === 'object' && 'gt' in where.id ? null : { id: USER_ID },
          ),
      },
      image: { findFirst: vi.fn().mockResolvedValue(null) },
      uploadReservation: { findFirst: vi.fn().mockResolvedValue(null), createMany },
    } as unknown as PrismaClient
    const invalidPage = Array.from({ length: 100 }, (_, index) => ({
      name: `invalid-${index}`,
      createdAt: OLD,
      updatedAt: OLD,
      isFolder: false,
    }))
    const offsets: number[] = []
    const list = vi.fn().mockImplementation(async (path: string, offset: number) => {
      if (path === `uploads/${HASH}`) {
        return offset === 0
          ? [{ name: '202607', createdAt: null, updatedAt: null, isFolder: true }]
          : []
      }
      offsets.push(offset)
      return offset < 1000
        ? invalidPage
        : [{ name: ORIGINAL, createdAt: OLD, updatedAt: OLD, isFolder: false }]
    })

    let finalResult
    for (let run = 0; run < 11; run += 1) {
      finalResult = await discoverLegacyUnconfirmedUploads(client, { list }, NOW, true)
    }

    expect(offsets).toContain(1000)
    expect(finalResult?.legacyDiscovered).toBe(1)
    expect(createMany).toHaveBeenCalledOnce()
  })

  it('resumes beyond 120 month folders instead of restarting the profile', async () => {
    let cursorValue: string | null = null
    const createMany = vi.fn().mockResolvedValue({ count: 1 })
    const client = {
      maintenanceCursor: {
        findUnique: vi.fn().mockImplementation(async () => (cursorValue ? { cursorValue } : null)),
        upsert: vi.fn().mockImplementation(async ({ create, update }) => {
          cursorValue = (cursorValue ? update : create).cursorValue
          return { cursorValue }
        }),
      },
      profile: {
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            where?.id && typeof where.id === 'object' && 'gt' in where.id ? null : { id: USER_ID },
          ),
      },
      image: { findFirst: vi.fn().mockResolvedValue(null) },
      uploadReservation: { findFirst: vi.fn().mockResolvedValue(null), createMany },
    } as unknown as PrismaClient
    const monthOffsets: number[] = []
    const list = vi.fn().mockImplementation(async (path: string, offset: number) => {
      if (path === `uploads/${HASH}`) {
        monthOffsets.push(offset)
        return offset <= 120
          ? [{ name: String(200001 + offset), createdAt: null, updatedAt: null, isFolder: true }]
          : []
      }
      return path.endsWith('/200121')
        ? [{ name: ORIGINAL, createdAt: OLD, updatedAt: OLD, isFolder: false }]
        : []
    })

    let finalResult
    for (let run = 0; run < 13; run += 1) {
      finalResult = await discoverLegacyUnconfirmedUploads(client, { list }, NOW, true)
    }

    expect(monthOffsets).toContain(120)
    expect(finalResult?.legacyDiscovered).toBe(1)
    expect(createMany).toHaveBeenCalledOnce()
  })
})
