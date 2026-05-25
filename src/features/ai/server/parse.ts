import 'server-only'

import { problems, type FieldError } from '@/server/api/problems'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const IMAGE_IDS_MAX = 5
const WEATHER_MAX = 20
const PARENT_NOTE_MAX = 200

export interface AiGenerateInput {
  childId: string
  imageIds: string[]
  recordedAt: Date | null
  weather: string | null
  parentNote: string | null
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

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function parseAiGenerateRequest(raw: unknown): AiGenerateInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []

  // child_id
  let childId = ''
  if (typeof body.child_id !== 'string') {
    errors.push({ path: 'body.child_id', reason: 'required', message: '必須項目です' })
  } else if (!isUuid(body.child_id)) {
    errors.push({
      path: 'body.child_id',
      reason: 'invalid_format',
      message: 'UUID 形式で指定してください',
    })
  } else {
    childId = body.child_id
  }

  // image_ids
  let imageIds: string[] = []
  if (!Array.isArray(body.image_ids)) {
    errors.push({
      path: 'body.image_ids',
      reason: 'required',
      message: '画像 ID の配列が必要です',
    })
  } else if (body.image_ids.length < 1) {
    errors.push({
      path: 'body.image_ids',
      reason: 'too_few',
      message: '1 件以上指定してください',
    })
  } else if (body.image_ids.length > IMAGE_IDS_MAX) {
    errors.push({
      path: 'body.image_ids',
      reason: 'too_many',
      message: `${IMAGE_IDS_MAX} 件以下で指定してください`,
    })
  } else {
    const ids: string[] = []
    let invalid = false
    for (let i = 0; i < body.image_ids.length; i++) {
      const v = body.image_ids[i]
      if (typeof v !== 'string' || !isUuid(v)) {
        errors.push({
          path: `body.image_ids[${i}]`,
          reason: 'invalid_format',
          message: 'UUID 形式で指定してください',
        })
        invalid = true
        break
      }
      ids.push(v)
    }
    const unique = new Set(ids)
    if (!invalid && unique.size !== ids.length) {
      errors.push({
        path: 'body.image_ids',
        reason: 'duplicate',
        message: '同じ画像 ID を複数指定できません',
      })
    } else if (!invalid) {
      imageIds = ids
    }
  }

  // recorded_at (optional)
  let recordedAt: Date | null = null
  if (body.recorded_at !== undefined && body.recorded_at !== null) {
    if (typeof body.recorded_at !== 'string' || !ISO_DATE_RE.test(body.recorded_at)) {
      errors.push({
        path: 'body.recorded_at',
        reason: 'invalid_format',
        message: 'YYYY-MM-DD 形式で指定してください',
      })
    } else {
      const d = new Date(`${body.recorded_at}T00:00:00Z`)
      if (Number.isNaN(d.getTime())) {
        errors.push({
          path: 'body.recorded_at',
          reason: 'invalid_format',
          message: '存在しない日付です',
        })
      } else {
        recordedAt = d
      }
    }
  }

  // weather (optional)
  let weather: string | null = null
  if (body.weather !== undefined && body.weather !== null) {
    if (typeof body.weather !== 'string') {
      errors.push({
        path: 'body.weather',
        reason: 'invalid_type',
        message: '文字列で指定してください',
      })
    } else if (body.weather.length > WEATHER_MAX) {
      errors.push({
        path: 'body.weather',
        reason: 'too_long',
        message: `${WEATHER_MAX} 文字以下で指定してください`,
      })
    } else {
      weather = body.weather
    }
  }

  // parent_note (optional)
  let parentNote: string | null = null
  if (body.parent_note !== undefined && body.parent_note !== null) {
    if (typeof body.parent_note !== 'string') {
      errors.push({
        path: 'body.parent_note',
        reason: 'invalid_type',
        message: '文字列で指定してください',
      })
    } else if (body.parent_note.length > PARENT_NOTE_MAX) {
      errors.push({
        path: 'body.parent_note',
        reason: 'too_long',
        message: `${PARENT_NOTE_MAX} 文字以下で指定してください`,
      })
    } else {
      parentNote = body.parent_note
    }
  }

  if (errors.length) throw problems.validation(errors)

  return { childId, imageIds, recordedAt, weather, parentNote }
}
