import 'server-only'

import { problems, type FieldError } from '@/server/api/problems'

// /v1/children の POST / PUT body をパースする。zod 等は導入せずインラインで検証。
// validation_error の path は OpenAPI 規約に従い `body.<field>` を用いる。

const NAME_MAX = 50
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export interface ChildCreateInput {
  name: string
  birthdate: Date
  avatarUrl: string | null
}

export interface ChildUpdateInput {
  name?: string
  birthdate?: Date
  avatarUrl?: string | null
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

export function parseChildCreate(raw: unknown): ChildCreateInput {
  const errors: FieldError[] = []
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>

  const name = parseName(body.name, errors, true)
  const birthdate = parseBirthdate(body.birthdate, errors, true)
  const avatarUrl = parseAvatarUrl(body.avatar_url, errors)

  if (errors.length) throw problems.validation(errors)

  // name/birthdate は required なので、エラー無ければ非 null を保証できる
  return { name: name as string, birthdate: birthdate as Date, avatarUrl }
}

export function parseChildUpdate(raw: unknown): ChildUpdateInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []
  const patch: ChildUpdateInput = {}

  if ('name' in body) {
    const name = parseName(body.name, errors, false)
    if (name !== null) patch.name = name
  }
  if ('birthdate' in body) {
    const birthdate = parseBirthdate(body.birthdate, errors, false)
    if (birthdate !== null) patch.birthdate = birthdate
  }
  if ('avatar_url' in body) {
    patch.avatarUrl = parseAvatarUrl(body.avatar_url, errors)
  }

  if (errors.length) throw problems.validation(errors)
  return patch
}

function parseName(value: unknown, errors: FieldError[], required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) errors.push({ path: 'body.name', reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'string') {
    errors.push({
      path: 'body.name',
      reason: 'invalid_type',
      message: '名前は文字列で指定してください',
    })
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    errors.push({ path: 'body.name', reason: 'too_short', message: '名前を入力してください' })
    return null
  }
  if (trimmed.length > NAME_MAX) {
    errors.push({
      path: 'body.name',
      reason: 'too_long',
      message: `${NAME_MAX} 文字以下で入力してください`,
    })
    return null
  }
  return trimmed
}

function parseBirthdate(value: unknown, errors: FieldError[], required: boolean): Date | null {
  if (value === undefined || value === null) {
    if (required)
      errors.push({ path: 'body.birthdate', reason: 'required', message: '必須項目です' })
    return null
  }
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    errors.push({
      path: 'body.birthdate',
      reason: 'invalid_format',
      message: 'YYYY-MM-DD 形式で入力してください',
    })
    return null
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    errors.push({
      path: 'body.birthdate',
      reason: 'invalid_format',
      message: '存在しない日付です',
    })
    return null
  }
  const today = new Date()
  if (date.getTime() > today.getTime()) {
    errors.push({
      path: 'body.birthdate',
      reason: 'future_date',
      message: '未来の日付は指定できません',
    })
    return null
  }
  return date
}

function parseAvatarUrl(value: unknown, errors: FieldError[]): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    errors.push({
      path: 'body.avatar_url',
      reason: 'invalid_type',
      message: 'URL は文字列で指定してください',
    })
    return null
  }
  return value
}
