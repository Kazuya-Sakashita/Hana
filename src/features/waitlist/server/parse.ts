import 'server-only'

import { createHmac } from 'node:crypto'
import { problems, type FieldError } from '@/server/api/problems'

const EMAIL_MAX = 320
export const DEFAULT_PRIVACY_POLICY_VERSION = 'prelaunch-2026-07-25'
export const DEFAULT_WAITLIST_SOURCE = 'current-lp'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_KEYS = new Set(['email', 'consent', 'source', 'privacy_policy_version'])
const ALLOWED_SOURCES = new Set([DEFAULT_WAITLIST_SOURCE])
const ALLOWED_PRIVACY_POLICY_VERSIONS = new Set([DEFAULT_PRIVACY_POLICY_VERSION])
const DEVELOPMENT_HASH_PEPPER = 'hana-waitlist-development-pepper'

export interface WaitlistSignupInput {
  email: string
  emailHash: string
  source: string
  privacyPolicyVersion: string
}

export function normalizeWaitlistEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function waitlistEmailHash(email: string): string {
  return createHmac('sha256', waitlistEmailHashPepper()).update(email).digest('hex')
}

export function parseWaitlistSignupCreate(raw: unknown): WaitlistSignupInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }

  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []
  collectUnknownFieldErrors(body, errors)
  const email = parseEmail(body.email, errors)
  const source = parseSource(body.source, errors)
  const privacyPolicyVersion = parsePrivacyPolicyVersion(body.privacy_policy_version, errors)

  if (body.consent !== true) {
    errors.push({
      path: 'body.consent',
      reason: 'required',
      message: 'メール連絡の利用目的への同意が必要です',
    })
  }

  if (errors.length) throw problems.validation(errors)

  return {
    email: email as string,
    emailHash: waitlistEmailHash(email as string),
    source,
    privacyPolicyVersion,
  }
}

function waitlistEmailHashPepper(): string {
  const pepper = process.env.WAITLIST_EMAIL_HASH_PEPPER
  if (pepper) return pepper
  if (process.env.NODE_ENV === 'production') {
    throw new Error('WAITLIST_EMAIL_HASH_PEPPER is not set')
  }
  return DEVELOPMENT_HASH_PEPPER
}

function collectUnknownFieldErrors(body: Record<string, unknown>, errors: FieldError[]): void {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push({
        path: 'body.unknown',
        reason: 'unknown_field',
        message: '指定できない項目です',
      })
    }
  }
}

function parseEmail(value: unknown, errors: FieldError[]): string | null {
  if (typeof value !== 'string') {
    errors.push({
      path: 'body.email',
      reason: 'required',
      message: 'メールアドレスを入力してください',
    })
    return null
  }

  const normalized = normalizeWaitlistEmail(value)
  if (normalized.length === 0) {
    errors.push({
      path: 'body.email',
      reason: 'too_short',
      message: 'メールアドレスを入力してください',
    })
    return null
  }
  if (normalized.length > EMAIL_MAX) {
    errors.push({
      path: 'body.email',
      reason: 'too_long',
      message: `${EMAIL_MAX} 文字以下で入力してください`,
    })
    return null
  }
  if (!EMAIL_RE.test(normalized)) {
    errors.push({
      path: 'body.email',
      reason: 'invalid_format',
      message: 'メールアドレスの形式で入力してください',
    })
    return null
  }
  return normalized
}

function parseSource(value: unknown, errors: FieldError[]): string {
  if (value === undefined || value === null || value === '') return DEFAULT_WAITLIST_SOURCE
  if (typeof value !== 'string') {
    errors.push({
      path: 'body.source',
      reason: 'invalid_type',
      message: '文字列で指定してください',
    })
    return DEFAULT_WAITLIST_SOURCE
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) return DEFAULT_WAITLIST_SOURCE
  if (!ALLOWED_SOURCES.has(trimmed)) {
    errors.push({
      path: 'body.source',
      reason: 'invalid_value',
      message: '指定できない登録元です',
    })
    return DEFAULT_WAITLIST_SOURCE
  }
  return trimmed
}

function parsePrivacyPolicyVersion(value: unknown, errors: FieldError[]): string {
  if (value === undefined || value === null || value === '') return DEFAULT_PRIVACY_POLICY_VERSION
  if (typeof value !== 'string') {
    errors.push({
      path: 'body.privacy_policy_version',
      reason: 'invalid_type',
      message: '文字列で指定してください',
    })
    return DEFAULT_PRIVACY_POLICY_VERSION
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) return DEFAULT_PRIVACY_POLICY_VERSION
  if (!ALLOWED_PRIVACY_POLICY_VERSIONS.has(trimmed)) {
    errors.push({
      path: 'body.privacy_policy_version',
      reason: 'invalid_value',
      message: '指定できないプライバシーポリシー版です',
    })
    return DEFAULT_PRIVACY_POLICY_VERSION
  }
  return trimmed
}
