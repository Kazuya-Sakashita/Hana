import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api/client'
import { ApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { createApiLogger, type LogRecord } from '@/lib/api/logger'

const BASE_URL = 'https://api.example.test/v1'

function makeLogger() {
  const records: LogRecord[] = []
  return {
    logger: createApiLogger({ level: 'debug', sink: (r) => records.push(r) }),
    records,
  }
}

function jsonResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  })
}

const problemPayload: ProblemDetails = {
  type: 'https://hana.app/problems/validation-error',
  title: 'Validation Error',
  status: 422,
  reason: 'validation_error',
  detail: '入力内容に誤りがあります',
}

describe('createApiClient', () => {
  it('attaches X-Request-Id without adding Authorization', async () => {
    const { logger } = makeLogger()
    const fetchMock = vi.fn(async (input: Request) => {
      expect(input.headers.get('Authorization')).toBeNull()
      expect(input.headers.get('X-Request-Id')).toMatch(/^req_[0-9a-f-]{36}$/)
      return jsonResponse(200, { status: 'ok' })
    })

    const client = createApiClient({
      baseUrl: BASE_URL,
      logger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    const { data, error } = await client.GET('/health')
    expect(error).toBeUndefined()
    expect(data).toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws ApiProblemError for application/problem+json responses', async () => {
    const { logger, records } = makeLogger()
    const fetchMock = vi.fn(async () =>
      jsonResponse(422, problemPayload, 'application/problem+json'),
    )

    const client = createApiClient({
      baseUrl: BASE_URL,
      logger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await expect(client.GET('/health')).rejects.toMatchObject({
      name: 'ApiProblemError',
      reason: 'validation_error',
      status: 422,
    })

    const warned = records.find((r) => r.level === 'warn')
    expect(warned?.reason).toBe('validation_error')
    expect(warned?.status).toBe(422)
  })

  it('throws a generic Error for non-problem error responses', async () => {
    const { logger, records } = makeLogger()
    const fetchMock = vi.fn(
      async () =>
        new Response('Server exploded', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
    )

    const client = createApiClient({
      baseUrl: BASE_URL,
      logger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await expect(client.GET('/health')).rejects.toBeInstanceOf(Error)
    await expect(client.GET('/health')).rejects.not.toBeInstanceOf(ApiProblemError)

    expect(records.some((r) => r.level === 'error' && r.reason === 'non_problem_error')).toBe(true)
  })

  it('does not log request or response bodies', async () => {
    const { logger, records } = makeLogger()
    const sensitiveBody = {
      email: 'leak@example.com',
      storage_key: 'uploads/xxx',
      name: 'Hana Child',
    }

    const fetchMock = vi.fn(async () => jsonResponse(200, sensitiveBody))

    const client = createApiClient({
      baseUrl: BASE_URL,
      logger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await client.GET('/health')

    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain('leak@example.com')
    expect(serialized).not.toContain('uploads/xxx')
    expect(serialized).not.toContain('Hana Child')
  })
})
