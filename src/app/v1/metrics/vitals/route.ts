import { NextResponse } from 'next/server'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { getCurrentUser } from '@/server/auth/current-user'
import { userIdHash } from '@/features/uploads/server/storage-key'

export const dynamic = 'force-dynamic'

// ISSUE-024 Web Vitals RUM 受信エンドポイント。
// - `navigator.sendBeacon` で送られた JSON を validate して構造化ログに記録
// - DB 保存しない (Vercel Logs で十分)
// - 匿名 (未認証) も受け入れる (公開エンドポイント)
// - **PII allowlist**: name / value / id / navigationType / route / userIdHash のみログ

const ALLOWED_NAMES = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])
const ALLOWED_NAV_TYPES = new Set([
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
])

interface ValidatedReport {
  name: string
  value: number
  id: string
  navigationType: string | null
  route: string
}

function parsePayload(raw: unknown): ValidatedReport {
  if (raw === null || typeof raw !== 'object') {
    throw problems.validation([{ path: 'body', reason: 'invalid', message: 'invalid body' }])
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.name !== 'string' || !ALLOWED_NAMES.has(obj.name)) {
    throw problems.validation([
      { path: 'body.name', reason: 'invalid', message: 'invalid metric name' },
    ])
  }
  if (typeof obj.value !== 'number' || !Number.isFinite(obj.value) || obj.value < 0) {
    throw problems.validation([{ path: 'body.value', reason: 'invalid', message: 'invalid value' }])
  }
  if (typeof obj.id !== 'string' || obj.id.length === 0 || obj.id.length > 128) {
    throw problems.validation([{ path: 'body.id', reason: 'invalid', message: 'invalid id' }])
  }
  if (typeof obj.route !== 'string' || obj.route.length === 0 || obj.route.length > 256) {
    throw problems.validation([{ path: 'body.route', reason: 'invalid', message: 'invalid route' }])
  }
  let navigationType: string | null = null
  if (obj.navigationType !== null && obj.navigationType !== undefined) {
    if (typeof obj.navigationType !== 'string' || !ALLOWED_NAV_TYPES.has(obj.navigationType)) {
      throw problems.validation([
        { path: 'body.navigationType', reason: 'invalid', message: 'invalid navigationType' },
      ])
    }
    navigationType = obj.navigationType
  }

  return {
    name: obj.name,
    value: obj.value,
    id: obj.id,
    navigationType,
    route: obj.route,
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json()) as unknown
    const report = parsePayload(raw)

    // 匿名 OK、 認証済なら userIdHash を付ける
    const user = await getCurrentUser()
    const userIdHashed = user ? userIdHash(user.id) : null

    // 構造化ログのみ (DB 保存しない)。 PII は含まない。
    console.log(
      JSON.stringify({
        operation: 'web-vitals',
        name: report.name,
        value: report.value,
        id: report.id,
        navigationType: report.navigationType,
        route: report.route,
        userIdHash: userIdHashed,
        level: 'info',
        ts: new Date().toISOString(),
      }),
    )

    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return toProblemResponse(e)
  }
}
