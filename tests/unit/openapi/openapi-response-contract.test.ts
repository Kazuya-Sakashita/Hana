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
    ).rejects.toThrow('$.data: required property missing')
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
