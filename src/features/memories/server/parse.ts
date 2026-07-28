import 'server-only'

import { problems, type FieldError } from '@/server/api/problems'

// /v1/memories の body / query をパースする。
// path 用の UUID 判定は children/parse.ts と共通化したいが、軽微なので独立。

const TITLE_MAX = 100
const BODY_MAX = 1000
const WEATHER_MAX = 20
const IMAGE_IDS_MAX = 5
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export interface MemoryCreateInput {
  childId: string
  title: string
  body: string | null
  recordedAt: Date
  weather: string | null
  imageIds: string[]
  aiGenerated: boolean
}

export interface MemoryUpdateInput {
  title?: string
  body?: string | null
  weather?: string | null
  isFavorite?: boolean
}

export interface ListMemoriesQuery {
  limit: number
  cursor: { id: string } | null
  recordedFrom: Date | null
  recordedBefore: Date | null
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw problems.validation([
      { path: 'body', reason: 'invalid_json', message: 'JSON が不正です' },
    ])
  }
}

export function parseMemoryCreate(raw: unknown): MemoryCreateInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []

  const childId = parseUuidField(body.child_id, 'body.child_id', errors, true)
  const title = parseStringRequired(body.title, 'body.title', 1, TITLE_MAX, errors)
  const bodyText = parseOptionalString(body.body, 'body.body', BODY_MAX, errors)
  const recordedAt = parseDate(body.recorded_at, 'body.recorded_at', errors, true)
  const weather = parseOptionalString(body.weather, 'body.weather', WEATHER_MAX, errors)
  const imageIds = parseImageIds(body.image_ids, errors)
  const aiGenerated = parseBooleanRequired(body.ai_generated, 'body.ai_generated', errors)

  if (errors.length) throw problems.validation(errors)

  return {
    childId: childId as string,
    title: title as string,
    body: bodyText,
    recordedAt: recordedAt as Date,
    weather,
    imageIds: imageIds as string[],
    aiGenerated: aiGenerated as boolean,
  }
}

export function parseMemoryUpdate(raw: unknown): MemoryUpdateInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []
  const patch: MemoryUpdateInput = {}

  if ('title' in body) {
    const title = parseStringRequired(body.title, 'body.title', 1, TITLE_MAX, errors)
    if (title !== null) patch.title = title
  }
  if ('body' in body) {
    patch.body = parseOptionalString(body.body, 'body.body', BODY_MAX, errors)
  }
  if ('weather' in body) {
    patch.weather = parseOptionalString(body.weather, 'body.weather', WEATHER_MAX, errors)
  }
  if ('is_favorite' in body) {
    if (typeof body.is_favorite !== 'boolean') {
      errors.push({
        path: 'body.is_favorite',
        reason: 'invalid_type',
        message: 'boolean で指定してください',
      })
    } else {
      patch.isFavorite = body.is_favorite
    }
  }

  if (errors.length) throw problems.validation(errors)
  return patch
}

export function parseListMemoriesQuery(url: URL): ListMemoriesQuery {
  const errors: FieldError[] = []

  let limit = 20
  const rawLimit = url.searchParams.get('limit')
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      errors.push({
        path: 'query.limit',
        reason: 'out_of_range',
        message: '1〜100 の整数で指定してください',
      })
    } else {
      limit = parsed
    }
  }

  let cursor: { id: string } | null = null
  const rawCursor = url.searchParams.get('cursor')
  if (rawCursor !== null && rawCursor.length > 0) {
    try {
      const decoded = Buffer.from(rawCursor, 'base64url').toString('utf-8')
      const parsed = JSON.parse(decoded) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        typeof (parsed as { id: unknown }).id === 'string' &&
        isUuid((parsed as { id: string }).id)
      ) {
        cursor = { id: (parsed as { id: string }).id }
      } else {
        errors.push({
          path: 'query.cursor',
          reason: 'invalid_format',
          message: 'cursor の形式が不正です',
        })
      }
    } catch {
      errors.push({
        path: 'query.cursor',
        reason: 'invalid_format',
        message: 'cursor の形式が不正です',
      })
    }
  }

  const rawRecordedFrom = url.searchParams.get('recorded_from')
  const rawRecordedBefore = url.searchParams.get('recorded_before')
  let recordedFrom: Date | null = null
  let recordedBefore: Date | null = null

  if ((rawRecordedFrom === null) !== (rawRecordedBefore === null)) {
    errors.push({
      path: rawRecordedFrom === null ? 'query.recorded_from' : 'query.recorded_before',
      reason: 'required_with',
      message: 'recorded_from と recorded_before は同時に指定してください',
    })
  } else if (rawRecordedFrom !== null && rawRecordedBefore !== null) {
    recordedFrom = parseIsoDate(rawRecordedFrom)
    recordedBefore = parseIsoDate(rawRecordedBefore)

    if (!recordedFrom) {
      errors.push({
        path: 'query.recorded_from',
        reason: 'invalid_format',
        message: 'YYYY-MM-DD 形式の実在する日付を指定してください',
      })
    }
    if (!recordedBefore) {
      errors.push({
        path: 'query.recorded_before',
        reason: 'invalid_format',
        message: 'YYYY-MM-DD 形式の実在する日付を指定してください',
      })
    }
    if (recordedFrom && recordedBefore && recordedFrom >= recordedBefore) {
      errors.push({
        path: 'query.recorded_before',
        reason: 'invalid_range',
        message: 'recorded_from より後の日付を指定してください',
      })
    }
  }

  if (errors.length) throw problems.validation(errors)
  return { limit, cursor, recordedFrom, recordedBefore }
}

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), 'utf-8').toString('base64url')
}

// ============================================================================
// internal helpers
// ============================================================================

function parseUuidField(
  value: unknown,
  path: string,
  errors: FieldError[],
  required: boolean,
): string | null {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'string' || !isUuid(value)) {
    errors.push({ path, reason: 'invalid_format', message: 'UUID 形式で指定してください' })
    return null
  }
  return value
}

function parseStringRequired(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: FieldError[],
): string | null {
  if (value === undefined || value === null) {
    errors.push({ path, reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'string') {
    errors.push({ path, reason: 'invalid_type', message: '文字列で指定してください' })
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length < min) {
    errors.push({ path, reason: 'too_short', message: '入力してください' })
    return null
  }
  if (trimmed.length > max) {
    errors.push({ path, reason: 'too_long', message: `${max} 文字以下で入力してください` })
    return null
  }
  return trimmed
}

function parseOptionalString(
  value: unknown,
  path: string,
  max: number,
  errors: FieldError[],
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    errors.push({ path, reason: 'invalid_type', message: '文字列で指定してください' })
    return null
  }
  if (value.length > max) {
    errors.push({ path, reason: 'too_long', message: `${max} 文字以下で入力してください` })
    return null
  }
  return value
}

function parseDate(
  value: unknown,
  path: string,
  errors: FieldError[],
  required: boolean,
): Date | null {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    errors.push({
      path,
      reason: 'invalid_format',
      message: 'YYYY-MM-DD 形式で指定してください',
    })
    return null
  }
  const date = parseIsoDate(value)
  if (!date) {
    errors.push({ path, reason: 'invalid_format', message: '存在しない日付です' })
    return null
  }
  const today = new Date()
  if (date.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    errors.push({ path, reason: 'future_date', message: '未来の日付は指定できません' })
    return null
  }
  return date
}

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date
}

function parseImageIds(value: unknown, errors: FieldError[]): string[] | null {
  if (!Array.isArray(value)) {
    errors.push({ path: 'body.image_ids', reason: 'required', message: '画像 ID の配列が必要です' })
    return null
  }
  if (value.length < 1) {
    errors.push({
      path: 'body.image_ids',
      reason: 'too_few',
      message: '1 件以上指定してください',
    })
    return null
  }
  if (value.length > IMAGE_IDS_MAX) {
    errors.push({
      path: 'body.image_ids',
      reason: 'too_many',
      message: `${IMAGE_IDS_MAX} 件以下で指定してください`,
    })
    return null
  }
  const ids: string[] = []
  for (let i = 0; i < value.length; i++) {
    const id = value[i]
    if (typeof id !== 'string' || !isUuid(id)) {
      errors.push({
        path: `body.image_ids[${i}]`,
        reason: 'invalid_format',
        message: 'UUID 形式で指定してください',
      })
      return null
    }
    ids.push(id)
  }
  // 重複を弾く
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    errors.push({
      path: 'body.image_ids',
      reason: 'duplicate',
      message: '同じ画像 ID を複数指定できません',
    })
    return null
  }
  return ids
}

function parseBooleanRequired(value: unknown, path: string, errors: FieldError[]): boolean | null {
  if (value === undefined || value === null) {
    errors.push({ path, reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'boolean') {
    errors.push({ path, reason: 'invalid_type', message: 'boolean で指定してください' })
    return null
  }
  return value
}
