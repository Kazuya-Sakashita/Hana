import { NextResponse } from 'next/server'
import {
  parseWebVitalsReport,
  shouldSampleWebVitals,
  toWebVitalsTelemetryDimensions,
} from '@/features/metrics/server/web-vitals'
import {
  assertWebVitalsProductionBoundary,
  assertWebVitalsRateLimit,
  webVitalsRetryAfterSeconds,
} from '@/features/metrics/server/web-vitals-rate-limit'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'

export const dynamic = 'force-dynamic'

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown
  } catch {
    throw problems.validation([
      { path: 'body', reason: 'invalid_json', message: 'JSON形式で送信してください' },
    ])
  }
}

function assertBrowserRequestBoundary(request: Request): void {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  const configuredOrigin = configuredWebVitalsOrigin(request)
  if (contentType !== 'application/json') {
    throw problems.validation([
      {
        path: 'header.Content-Type',
        reason: 'request_boundary_invalid',
        message: '同一originのJSON requestだけを受け付けます',
      },
    ])
  }
  if (origin !== configuredOrigin) {
    throw problems.validation([
      {
        path: 'header.Origin',
        reason: 'request_boundary_invalid',
        message: '同一originのJSON requestだけを受け付けます',
      },
    ])
  }
  if (fetchSite !== 'same-origin') {
    throw problems.validation([
      {
        path: 'header.Sec-Fetch-Site',
        reason: 'request_boundary_invalid',
        message: '同一originのJSON requestだけを受け付けます',
      },
    ])
  }
}

function configuredWebVitalsOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw problems.telemetryUnavailable()
    return new URL(request.url).origin
  }
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw problems.telemetryUnavailable()
  }
  const developmentHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  if ((url.protocol !== 'https:' && !developmentHttp) || url.username || url.password) {
    throw problems.telemetryUnavailable()
  }
  return url.origin
}

export async function POST(request: Request) {
  try {
    assertWebVitalsProductionBoundary(request)
    assertBrowserRequestBoundary(request)
    assertWebVitalsRateLimit(request)
    const report = parseWebVitalsReport(await readJson(request))
    if (!shouldSampleWebVitals(report.event_id)) {
      return new NextResponse(null, { status: 204 })
    }
    console.log(
      JSON.stringify({
        schema_version: 'hana-telemetry-dimensions/v1',
        ...toWebVitalsTelemetryDimensions(report),
        level: 'info',
        ts: new Date().toISOString(),
      }),
    )
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const response = toProblemResponse(error)
    const retryAfterSeconds = webVitalsRetryAfterSeconds(error)
    if (retryAfterSeconds !== null) response.headers.set('Retry-After', String(retryAfterSeconds))
    return response
  }
}
