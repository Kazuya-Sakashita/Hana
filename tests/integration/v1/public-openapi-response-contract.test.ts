import { describe, expect, it } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'

function problem(status: number, reason: string) {
  return new Response(
    JSON.stringify({
      type: `https://hana.app/problems/${reason.replaceAll('_', '-')}`,
      title: 'Synthetic Problem',
      status,
      reason,
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

describe('public OpenAPI response contracts', () => {
  it.each([
    {
      method: 'GET',
      route: '/health',
      response: () => Response.json({ status: 'ok' }),
    },
    {
      method: 'GET',
      route: '/health',
      response: () => problem(500, 'internal_server_error'),
    },
    {
      method: 'GET',
      route: '/me/account-deletion/status',
      response: () =>
        Response.json({
          status: 'accepted',
          requested_at: '2026-08-01T00:00:00Z',
          purge_after: '2026-08-31T00:00:00Z',
        }),
    },
    {
      method: 'GET',
      route: '/me/account-deletion/status',
      response: () => problem(404, 'not_found'),
    },
    {
      method: 'POST',
      route: '/metrics/vitals',
      response: () => new Response(null, { status: 204 }),
    },
    {
      method: 'POST',
      route: '/metrics/vitals',
      response: () => problem(422, 'validation_error'),
    },
    {
      method: 'POST',
      route: '/metrics/vitals',
      response: () => problem(500, 'internal_server_error'),
    },
    {
      method: 'POST',
      route: '/waitlist',
      response: () => Response.json({ status: 'accepted' }, { status: 202 }),
    },
    {
      method: 'POST',
      route: '/waitlist',
      response: () => problem(429, 'rate_limited'),
    },
  ])('validates $method $route success or representative error', async (testCase) => {
    await expect(
      assertOpenApiResponse({
        method: testCase.method,
        route: testCase.route,
        response: testCase.response(),
      }),
    ).resolves.toBeUndefined()
  })
})
