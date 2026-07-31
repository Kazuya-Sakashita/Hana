import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 54321
const userId = '00000000-0000-4000-8000-000000000140'
const accessToken =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAxNDAiLCJleHAiOjQxMDI0NDQ4MDB9.synthetic'
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: null,
  app_metadata: { provider: 'synthetic', providers: ['synthetic'] },
  user_metadata: { fixture: 'ISSUE-140' },
  identities: [],
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  is_anonymous: false,
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${accessToken}`
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  if (url.pathname === '/health') return json(response, 200, { status: 'ok' })
  if (url.pathname === '/auth/v1/user' && request.method === 'GET' && authorized(request)) {
    return json(response, 200, user)
  }
  if (url.pathname === '/auth/v1/logout' && request.method === 'POST' && authorized(request)) {
    response.writeHead(204)
    return response.end()
  }
  return json(response, 401, { code: 'invalid_token', message: 'synthetic auth rejected' })
}).listen(port, host, () => {
  console.info('ISSUE-140 synthetic auth fixture ready')
})
