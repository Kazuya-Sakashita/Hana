import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000'
const IMAGE_ID = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'
const OWNER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_OWNER_ID = '11111111-2222-4333-8444-555555555555'

function makeSessionStorageStub(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    get length() {
      return map.size
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
  } satisfies Storage
}

describe('recordDraftStore', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: makeSessionStorageStub() })
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function loadModule() {
    return import('@/features/memories/client/record-draft-store')
  }

  const fields = {
    idempotencyKey: IDEMPOTENCY_KEY,
    title: '合成タイトル',
    body: '合成本文',
    parentNote: '合成メモ',
    recordedAt: '2026-07-28',
    weather: 'はれ',
    imageId: IMAGE_ID,
    aiGenerated: true,
  }

  it('restores the allowed draft fields within the TTL', async () => {
    const { recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    expect(recordDraftStore.load(OWNER_ID, 2_000)).toEqual(fields)
  })

  it('stores only the explicit allowlist and never image data or URLs', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    const parsed = JSON.parse(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)!) as Record<
      string,
      unknown
    >
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'aiGenerated',
        'body',
        'expiresAt',
        'idempotencyKey',
        'imageId',
        'ownerId',
        'parentNote',
        'recordedAt',
        'title',
        'version',
        'weather',
      ].sort(),
    )
    for (const forbidden of ['blob', 'file', 'imageUrl', 'presignedUrl', 'storageKey', 'prompt']) {
      expect(parsed).not.toHaveProperty(forbidden)
    }
  })

  it('removes and rejects an expired draft', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, RECORD_DRAFT_TTL_MS, recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    expect(recordDraftStore.load(OWNER_ID, 1_000 + RECORD_DRAFT_TTL_MS + 1)).toBeNull()
    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('removes malformed or unknown-version data without restoring it', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    window.sessionStorage.setItem(
      RECORD_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...fields, ownerId: OWNER_ID, version: 2, expiresAt: 10_000 }),
    )

    expect(recordDraftStore.load(OWNER_ID, 2_000)).toBeNull()
    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('removes a draft before restoring it for a different account in the same tab', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    expect(recordDraftStore.load(OTHER_OWNER_ID, 2_000)).toBeNull()
    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('clears the draft explicitly', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    recordDraftStore.clear()

    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })
})
