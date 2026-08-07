import { NextResponse } from 'next/server'
import {
  parseWebVitalsReport,
  toWebVitalsTelemetryDimensions,
} from '@/features/metrics/server/web-vitals'
import {
  assertWebVitalsRateLimit,
  webVitalsRetryAfterSeconds,
} from '@/features/metrics/server/web-vitals-rate-limit'
import { shouldSampleTelemetry } from '@/features/metrics/server/telemetry-contract'
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

export async function POST(request: Request) {
  try {
    assertWebVitalsRateLimit(request)
    const report = parseWebVitalsReport(await readJson(request))
    if (!shouldSampleTelemetry('web_vital', report.event_id)) {
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
