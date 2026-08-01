'use client'

export const RECORD_DRAFT_STORAGE_KEY = 'hana:recordDraft:v1'
export const RECORD_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const expiredDraftOwners = new Set<string>()

export interface RecordDraftFields {
  idempotencyKey: string
  title: string
  body: string
  parentNote: string
  recordedAt: string
  weather: string
  imageIds: string[]
  aiGenerated: boolean
  aiDraftNeedsReview: boolean
}

interface StoredRecordDraft extends RecordDraftFields {
  version: 2
  ownerId: string
  expiresAt: number
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const COMMON_KEYS = [
  'version',
  'ownerId',
  'expiresAt',
  'idempotencyKey',
  'title',
  'body',
  'parentNote',
  'recordedAt',
  'weather',
  'aiGenerated',
] as const

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  )
}

function hasValidCommonFields(draft: Record<string, unknown>): boolean {
  return (
    typeof draft.ownerId === 'string' &&
    UUID_RE.test(draft.ownerId) &&
    typeof draft.expiresAt === 'number' &&
    Number.isFinite(draft.expiresAt) &&
    typeof draft.idempotencyKey === 'string' &&
    UUID_RE.test(draft.idempotencyKey) &&
    typeof draft.title === 'string' &&
    draft.title.length <= 100 &&
    typeof draft.body === 'string' &&
    draft.body.length <= 1000 &&
    typeof draft.parentNote === 'string' &&
    draft.parentNote.length <= 200 &&
    typeof draft.recordedAt === 'string' &&
    DATE_RE.test(draft.recordedAt) &&
    typeof draft.weather === 'string' &&
    draft.weather.length <= 20 &&
    typeof draft.aiGenerated === 'boolean'
  )
}

function isImageIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 5 &&
    value.every((imageId) => typeof imageId === 'string' && UUID_RE.test(imageId)) &&
    new Set(value).size === value.length
  )
}

function isStoredRecordDraft(value: unknown): value is StoredRecordDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  return (
    draft.version === 2 &&
    hasExactKeys(draft, [...COMMON_KEYS, 'imageIds', 'aiDraftNeedsReview']) &&
    hasValidCommonFields(draft) &&
    isImageIds(draft.imageIds) &&
    typeof draft.aiDraftNeedsReview === 'boolean'
  )
}

function migrateV1(value: unknown): StoredRecordDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const draft = value as Record<string, unknown>
  if (
    draft.version !== 1 ||
    !hasExactKeys(draft, [...COMMON_KEYS, 'imageId']) ||
    !hasValidCommonFields(draft) ||
    !(draft.imageId === null || (typeof draft.imageId === 'string' && UUID_RE.test(draft.imageId)))
  ) {
    return null
  }
  return {
    version: 2,
    ownerId: draft.ownerId as string,
    expiresAt: draft.expiresAt as number,
    idempotencyKey: draft.idempotencyKey as string,
    title: draft.title as string,
    body: draft.body as string,
    parentNote: draft.parentNote as string,
    recordedAt: draft.recordedAt as string,
    weather: draft.weather as string,
    imageIds: draft.imageId === null ? [] : [draft.imageId as string],
    aiGenerated: draft.aiGenerated as boolean,
    aiDraftNeedsReview: false,
  }
}

export function createRecordIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}

export const recordDraftStore = {
  load(ownerId: string, now = Date.now()): RecordDraftFields | null {
    const storage = getSessionStorage()
    if (!storage) return null
    try {
      const raw = storage.getItem(RECORD_DRAFT_STORAGE_KEY)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      const stored = isStoredRecordDraft(parsed) ? parsed : migrateV1(parsed)
      if (!stored || stored.ownerId !== ownerId) {
        storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
        return null
      }
      if (stored.expiresAt <= now) {
        expiredDraftOwners.add(ownerId)
        storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
        return null
      }
      if (!isStoredRecordDraft(parsed))
        storage.setItem(RECORD_DRAFT_STORAGE_KEY, JSON.stringify(stored))
      return {
        idempotencyKey: stored.idempotencyKey,
        title: stored.title,
        body: stored.body,
        parentNote: stored.parentNote,
        recordedAt: stored.recordedAt,
        weather: stored.weather,
        imageIds: [...stored.imageIds],
        aiGenerated: stored.aiGenerated,
        aiDraftNeedsReview: stored.aiDraftNeedsReview,
      }
    } catch {
      try {
        storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
      } catch {
        return null
      }
      return null
    }
  },

  save(ownerId: string, fields: RecordDraftFields, now = Date.now()): void {
    const storage = getSessionStorage()
    if (!storage || expiredDraftOwners.has(ownerId)) return
    let expiresAt = now + RECORD_DRAFT_TTL_MS
    try {
      const raw = storage.getItem(RECORD_DRAFT_STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        const existing = isStoredRecordDraft(parsed) ? parsed : migrateV1(parsed)
        if (existing?.expiresAt !== undefined && existing.expiresAt <= now) {
          if (existing.ownerId === ownerId) expiredDraftOwners.add(ownerId)
          storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
          return
        }
        if (existing?.ownerId === ownerId) {
          expiresAt = existing.expiresAt
        }
      }
    } catch {
      try {
        storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
      } catch {
        return
      }
    }
    const stored: StoredRecordDraft = {
      version: 2,
      ownerId,
      expiresAt,
      idempotencyKey: fields.idempotencyKey,
      title: fields.title,
      body: fields.body,
      parentNote: fields.parentNote,
      recordedAt: fields.recordedAt,
      weather: fields.weather,
      imageIds: [...fields.imageIds],
      aiGenerated: fields.aiGenerated,
      aiDraftNeedsReview: fields.aiDraftNeedsReview,
    }
    if (!isStoredRecordDraft(stored)) return
    try {
      storage.setItem(RECORD_DRAFT_STORAGE_KEY, JSON.stringify(stored))
    } catch {
      return
    }
  },

  clear(): void {
    expiredDraftOwners.clear()
    const storage = getSessionStorage()
    if (!storage) return
    try {
      storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
    } catch {
      return
    }
  },
}
