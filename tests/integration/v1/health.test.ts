import { describe, expect, it } from 'vitest'
import { GET } from '@/app/v1/health/route'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'

describe('GET /v1/health', () => {
  it('returns the declared public health response', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await assertOpenApiResponse({ method: 'GET', route: '/health', response })
  })
})
