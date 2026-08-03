import createOpenapiClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/lib/api/generated/schema'
import { ApiProblemError, isProblemDetails, PROBLEM_CONTENT_TYPE } from '@/lib/api/error'
import { type ApiLogger, type HttpMethod, createApiLogger } from '@/lib/api/logger'
import { generateRequestId } from '@/lib/api/request-id'

export type CreateApiClientOptions = {
  baseUrl: string
  logger?: ApiLogger
  fetch?: typeof globalThis.fetch
}

type StartedRequest = {
  method: HttpMethod
  path: string
  request_id: string
  started_at: number
}

const STARTED_REQUEST = new WeakMap<Request, StartedRequest>()

function deriveMethod(input: string): HttpMethod {
  const upper = input.toUpperCase()
  if (
    upper === 'GET' ||
    upper === 'POST' ||
    upper === 'PUT' ||
    upper === 'PATCH' ||
    upper === 'DELETE'
  ) {
    return upper
  }
  return 'GET'
}

function derivePath(url: string, baseUrl: string): string {
  if (url.startsWith(baseUrl)) {
    const tail = url.slice(baseUrl.length)
    return tail || '/'
  }
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function createApiClient(options: CreateApiClientOptions) {
  const { baseUrl, fetch } = options
  const logger = options.logger ?? createApiLogger()

  const middleware: Middleware = {
    async onRequest({ request }) {
      const headers = new Headers(request.headers)
      const requestId = headers.get('X-Request-Id') ?? generateRequestId()
      headers.set('X-Request-Id', requestId)

      const next = new Request(request, { headers })
      const method = deriveMethod(next.method)
      const path = derivePath(next.url, baseUrl)
      STARTED_REQUEST.set(next, {
        method,
        path,
        request_id: requestId,
        started_at: Date.now(),
      })
      return next
    },

    async onResponse({ request, response }) {
      const started = STARTED_REQUEST.get(request)
      const elapsed_ms = started ? Date.now() - started.started_at : undefined
      const base = started
        ? {
            operation: `${started.method} ${started.path}`,
            method: started.method,
            path: started.path,
            request_id: started.request_id,
          }
        : { operation: 'unknown', method: 'GET' as HttpMethod, path: 'unknown' }

      if (response.ok) {
        logger.info({ ...base, status: response.status, elapsed_ms })
        return response
      }

      const contentType = response.headers.get('Content-Type') ?? ''
      if (contentType.includes(PROBLEM_CONTENT_TYPE)) {
        const body: unknown = await response.clone().json()
        if (isProblemDetails(body)) {
          logger.warn({ ...base, status: response.status, elapsed_ms, reason: body.reason })
          throw new ApiProblemError(body)
        }
      }

      logger.error({ ...base, status: response.status, elapsed_ms, reason: 'non_problem_error' })
      throw new Error(`HTTP ${response.status} (non-problem response)`)
    },
  }

  const client = createOpenapiClient<paths>({ baseUrl, fetch })
  client.use(middleware)
  return client
}

export type ApiClient = ReturnType<typeof createApiClient>
