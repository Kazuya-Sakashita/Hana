import { describe, expect, it } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'

describe('OpenAPI response contract failures', () => {
  it('rejects an undeclared status', async () => {
    const response = Response.json({ data: [] }, { status: 418 })
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/children', response }),
    ).rejects.toThrow('response status not declared')
  })

  it('rejects an undeclared Content-Type', async () => {
    const response = new Response('safe synthetic body', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/children', response }),
    ).rejects.toThrow('Content-Type not declared')
  })

  it('rejects a success body with a missing required property', async () => {
    const response = Response.json({}, { status: 200 })
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/children', response }),
    ).rejects.toThrow("must have required property 'data'")
  })

  it('rejects a success body with an invalid UUID format', async () => {
    const response = Response.json({
      data: [
        {
          id: 'not-a-uuid',
          name: '合成の呼び名',
          birthdate: '2026-01-13',
          avatar_url: null,
          created_at: '2026-05-23T01:30:00Z',
          updated_at: '2026-05-23T01:30:00Z',
        },
      ],
    })
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/children', response }),
    ).rejects.toThrow('must match format "uuid"')
  })

  it('rejects enum violations', async () => {
    const response = Response.json({ status: 'degraded' })
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/health', response }),
    ).rejects.toThrow('must be equal to one of the allowed values')
  })

  it('rejects undeclared properties when the schema closes the object', async () => {
    const response = Response.json(
      { status: 'accepted', internal_id: 'synthetic' },
      { status: 202 },
    )
    await expect(
      assertOpenApiResponse({ method: 'POST', route: '/waitlist', response }),
    ).rejects.toThrow('must NOT have additional properties')
  })

  it('rejects ProblemDetails whose status differs from HTTP status', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'https://hana.app/problems/unauthorized',
        title: 'Unauthorized',
        status: 422,
        reason: 'unauthorized',
      }),
      { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
    )
    await expect(
      assertOpenApiResponse({ method: 'GET', route: '/children', response }),
    ).rejects.toThrow('expected HTTP status 401')
  })
})
