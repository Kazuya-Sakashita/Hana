import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000'
const IMAGE_ID = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'
const SECOND_IMAGE_ID = 'b1b2c3d4-1234-4d8e-9abc-fedcba987655'
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
    imageIds: [IMAGE_ID, SECOND_IMAGE_ID],
    aiGenerated: true,
    aiDraftNeedsReview: false,
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
        'aiDraftNeedsReview',
        'body',
        'expiresAt',
        'idempotencyKey',
        'imageIds',
        'ownerId',
        'parentNote',
        'recordedAt',
        'title',
        'version',
        'weather',
      ].sort(),
    )
    for (const forbidden of [
      'blob',
      'file',
      'fileName',
      'imageUrl',
      'objectUrl',
      'presignedUrl',
      'signedUrl',
      'storageKey',
      'prompt',
    ]) {
      expect(parsed).not.toHaveProperty(forbidden)
    }
  })

  it('migrates an exact valid v1 draft without extending its expiry', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    window.sessionStorage.setItem(
      RECORD_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ownerId: OWNER_ID,
        expiresAt: 10_000,
        idempotencyKey: IDEMPOTENCY_KEY,
        title: fields.title,
        body: fields.body,
        parentNote: fields.parentNote,
        recordedAt: fields.recordedAt,
        weather: fields.weather,
        imageId: IMAGE_ID,
        aiGenerated: fields.aiGenerated,
      }),
    )

    expect(recordDraftStore.load(OWNER_ID, 2_000)).toEqual({
      ...fields,
      imageIds: [IMAGE_ID],
    })
    expect(JSON.parse(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      expiresAt: 10_000,
      imageIds: [IMAGE_ID],
    })
  })

  it('restores the explicit review gate without storing image data', async () => {
    const { recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, { ...fields, aiDraftNeedsReview: true }, 1_000)

    expect(recordDraftStore.load(OWNER_ID, 2_000)).toMatchObject({ aiDraftNeedsReview: true })
  })

  it('removes and rejects an expired draft', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, RECORD_DRAFT_TTL_MS, recordDraftStore } = await loadModule()
    recordDraftStore.save(OWNER_ID, fields, 1_000)

    expect(recordDraftStore.load(OWNER_ID, 1_000 + RECORD_DRAFT_TTL_MS + 1)).toBeNull()
    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('keeps the original expiry when updating a draft after 23 hours', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, RECORD_DRAFT_TTL_MS, recordDraftStore } = await loadModule()
    const createdAt = 1_000
    recordDraftStore.save(OWNER_ID, fields, createdAt)

    recordDraftStore.save(
      OWNER_ID,
      { ...fields, title: '23時間後の更新' },
      createdAt + 23 * 60 * 60 * 1000,
    )

    expect(JSON.parse(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)!)).toMatchObject({
      title: '23時間後の更新',
      expiresAt: createdAt + RECORD_DRAFT_TTL_MS,
    })
  })

  it('removes an expired draft without recreating it during the same save', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, RECORD_DRAFT_TTL_MS, recordDraftStore } = await loadModule()
    const createdAt = 1_000
    recordDraftStore.save(OWNER_ID, fields, createdAt)

    recordDraftStore.save(
      OWNER_ID,
      { ...fields, title: '期限後の自動保存' },
      createdAt + RECORD_DRAFT_TTL_MS + 1,
    )

    recordDraftStore.save(
      OWNER_ID,
      { ...fields, title: '期限後の次の自動保存' },
      createdAt + RECORD_DRAFT_TTL_MS + 2,
    )

    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('removes malformed or unknown-version data without restoring it', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    window.sessionStorage.setItem(
      RECORD_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...fields,
        ownerId: OWNER_ID,
        version: 3,
        expiresAt: 10_000,
      }),
    )

    expect(recordDraftStore.load(OWNER_ID, 2_000)).toBeNull()
    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('rejects unknown keys, duplicate IDs, and more than five IDs', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    const base = {
      version: 2,
      ownerId: OWNER_ID,
      expiresAt: 10_000,
      ...fields,
    }

    for (const invalid of [
      { ...base, storageKey: 'forbidden' },
      { ...base, imageIds: [IMAGE_ID, IMAGE_ID] },
      {
        ...base,
        imageIds: [
          IMAGE_ID,
          SECOND_IMAGE_ID,
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      },
    ]) {
      window.sessionStorage.setItem(RECORD_DRAFT_STORAGE_KEY, JSON.stringify(invalid))
      expect(recordDraftStore.load(OWNER_ID, 2_000)).toBeNull()
    }
  })

  it('does not persist invalid image IDs passed to save at runtime', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()

    recordDraftStore.save(
      OWNER_ID,
      {
        ...fields,
        imageIds: [IMAGE_ID, IMAGE_ID],
      },
      1_000,
    )

    expect(window.sessionStorage.getItem(RECORD_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('rejects a v1 draft with an unknown field instead of migrating it', async () => {
    const { RECORD_DRAFT_STORAGE_KEY, recordDraftStore } = await loadModule()
    const { imageIds: _imageIds, ...common } = fields
    window.sessionStorage.setItem(
      RECORD_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...common,
        version: 1,
        ownerId: OWNER_ID,
        expiresAt: 10_000,
        imageId: IMAGE_ID,
        fileName: 'forbidden',
      }),
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
