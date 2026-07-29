'use client'

export const RECORD_DRAFT_STORAGE_KEY = 'hana:recordDraft:v1'
export const RECORD_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface RecordDraftFields {
  idempotencyKey: string
  title: string
  body: string
  parentNote: string
  recordedAt: string
  weather: string
  imageId: string | null
  aiGenerated: boolean
}

interface StoredRecordDraft extends RecordDraftFields {
  version: 1
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

function isStoredRecordDraft(value: unknown): value is StoredRecordDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<StoredRecordDraft>
  return (
    draft.version === 1 &&
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
    (draft.imageId === null ||
      (typeof draft.imageId === 'string' && UUID_RE.test(draft.imageId))) &&
    typeof draft.aiGenerated === 'boolean'
  )
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
      if (!isStoredRecordDraft(parsed) || parsed.ownerId !== ownerId || parsed.expiresAt <= now) {
        storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
        return null
      }
      return {
        idempotencyKey: parsed.idempotencyKey,
        title: parsed.title,
        body: parsed.body,
        parentNote: parsed.parentNote,
        recordedAt: parsed.recordedAt,
        weather: parsed.weather,
        imageId: parsed.imageId,
        aiGenerated: parsed.aiGenerated,
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
    if (!storage) return
    const stored: StoredRecordDraft = {
      version: 1,
      ownerId,
      expiresAt: now + RECORD_DRAFT_TTL_MS,
      idempotencyKey: fields.idempotencyKey,
      title: fields.title,
      body: fields.body,
      parentNote: fields.parentNote,
      recordedAt: fields.recordedAt,
      weather: fields.weather,
      imageId: fields.imageId,
      aiGenerated: fields.aiGenerated,
    }
    try {
      storage.setItem(RECORD_DRAFT_STORAGE_KEY, JSON.stringify(stored))
    } catch {
      return
    }
  },

  clear(): void {
    const storage = getSessionStorage()
    if (!storage) return
    try {
      storage.removeItem(RECORD_DRAFT_STORAGE_KEY)
    } catch {
      return
    }
  },
}
