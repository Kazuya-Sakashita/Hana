import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { E2E_ACCESS_TOKEN, E2E_FIXTURE_CONTROL_TOKEN, E2E_USER } from './constants'

const host = '127.0.0.1'
const port = 54321
const storagePrefix = '/storage/v1'
const bucketPrefix = 'images/'
const fixtureTimestamp = '2026-07-31T00:00:00.000Z'

interface StoredObject {
  body: Buffer
  contentType: string
}

const objects = new Map<string, StoredObject>()
const uploadTokens = new Map<string, string>()
let failNextSignedUpload = false

function authorized(request: IncomingMessage) {
  return request.headers.authorization === `Bearer ${E2E_ACCESS_TOKEN}`
}

function storageAuthorized(request: IncomingMessage) {
  return request.headers.authorization === 'Bearer synthetic-service-role-key'
}

function corsHeaders() {
  return {
    'access-control-allow-headers':
      'authorization, apikey, content-type, x-fixture-control, x-upsert',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-origin': '*',
  }
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { ...corsHeaders(), 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function empty(response: ServerResponse, status: number) {
  response.writeHead(status, corsHeaders())
  response.end()
}

function objectNotFound(response: ServerResponse) {
  json(response, 404, {
    statusCode: '404',
    error: 'not_found',
    message: 'Synthetic object not found',
  })
}

function keyAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null
  return decodeURIComponent(pathname.slice(prefix.length))
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  if (request.method === 'OPTIONS') return empty(response, 204)
  if (url.pathname === '/health') return json(response, 200, { status: 'ok' })
  if (url.pathname === '/auth/v1/user' && request.method === 'GET' && authorized(request)) {
    return json(response, 200, E2E_USER)
  }
  if (url.pathname === '/auth/v1/logout' && request.method === 'POST' && authorized(request)) {
    return empty(response, 204)
  }
  if (
    url.pathname === '/__fixture__/fail-next-upload' &&
    request.method === 'POST' &&
    request.headers['x-fixture-control'] === E2E_FIXTURE_CONTROL_TOKEN
  ) {
    failNextSignedUpload = true
    return empty(response, 204)
  }

  const signedUploadPrefix = `${storagePrefix}/object/upload/sign/${bucketPrefix}`
  const signedUploadKey = keyAfter(url.pathname, signedUploadPrefix)
  if (signedUploadKey !== null && request.method === 'POST' && storageAuthorized(request)) {
    const token = `synthetic-${uploadTokens.size + 1}`
    uploadTokens.set(token, signedUploadKey)
    return json(response, 200, {
      url: `/object/upload/sign/${bucketPrefix}${signedUploadKey}?token=${token}`,
    })
  }
  if (signedUploadKey !== null && request.method === 'PUT') {
    const token = url.searchParams.get('token')
    if (!token || uploadTokens.get(token) !== signedUploadKey) {
      return json(response, 401, { message: 'Synthetic signed upload rejected' })
    }
    if (failNextSignedUpload) {
      failNextSignedUpload = false
      return json(response, 503, { message: 'Synthetic upload failure' })
    }
    uploadTokens.delete(token)
    objects.set(signedUploadKey, {
      body: await readBody(request),
      contentType: request.headers['content-type'] ?? 'application/octet-stream',
    })
    return json(response, 200, { Key: `${bucketPrefix}${signedUploadKey}` })
  }

  const infoPrefix = `${storagePrefix}/object/info/${bucketPrefix}`
  const infoKey = keyAfter(url.pathname, infoPrefix)
  if (infoKey !== null && request.method === 'GET' && storageAuthorized(request)) {
    const stored = objects.get(infoKey)
    if (!stored) return objectNotFound(response)
    return json(response, 200, {
      id: '00000000-0000-4000-8000-000000000140',
      version: 'synthetic-v1',
      name: infoKey,
      bucket_id: 'images',
      created_at: fixtureTimestamp,
      last_modified: fixtureTimestamp,
      size: stored.body.length,
      content_type: stored.contentType,
      cache_control: '300',
    })
  }

  const objectPrefix = `${storagePrefix}/object/${bucketPrefix}`
  const objectKey = keyAfter(url.pathname, objectPrefix)
  if (objectKey !== null && request.method === 'GET' && storageAuthorized(request)) {
    const stored = objects.get(objectKey)
    if (!stored) return objectNotFound(response)
    response.writeHead(200, {
      ...corsHeaders(),
      'content-length': stored.body.length,
      'content-type': stored.contentType,
    })
    return response.end(stored.body)
  }
  if (
    objectKey !== null &&
    (request.method === 'POST' || request.method === 'PUT') &&
    storageAuthorized(request)
  ) {
    objects.set(objectKey, {
      body: await readBody(request),
      contentType: request.headers['content-type'] ?? 'application/octet-stream',
    })
    return json(response, 200, {
      Id: '00000000-0000-4000-8000-000000000140',
      Key: `${bucketPrefix}${objectKey}`,
    })
  }

  const signedDownloadPrefix = `${storagePrefix}/object/sign/${bucketPrefix}`
  const signedDownloadKey = keyAfter(url.pathname, signedDownloadPrefix)
  if (signedDownloadKey !== null && request.method === 'POST' && storageAuthorized(request)) {
    return json(response, 200, {
      signedURL: `/object/sign/${bucketPrefix}${signedDownloadKey}?token=synthetic-download`,
    })
  }
  if (
    signedDownloadKey !== null &&
    request.method === 'GET' &&
    url.searchParams.get('token') === 'synthetic-download'
  ) {
    const stored = objects.get(signedDownloadKey)
    if (!stored) return objectNotFound(response)
    response.writeHead(200, { ...corsHeaders(), 'content-type': stored.contentType })
    return response.end(stored.body)
  }

  return json(response, 401, { code: 'invalid_token', message: 'Synthetic fixture rejected' })
}

createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) json(response, 500, { message: 'Synthetic fixture failed' })
    else response.end()
  })
}).listen(port, host, () => {
  console.info('ISSUE-140 synthetic Supabase fixture ready')
})
