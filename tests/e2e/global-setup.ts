import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FullConfig } from '@playwright/test'
import { E2E_ACCESS_TOKEN, E2E_AUTH_COOKIE, E2E_REFRESH_TOKEN, E2E_USER } from './support/constants'

export const authStatePath = join(process.cwd(), 'test-results', '.auth', 'issue-140.json')

function encodedSession() {
  const expiresAt = 4_102_444_800
  const value = JSON.stringify({
    access_token: E2E_ACCESS_TOKEN,
    refresh_token: E2E_REFRESH_TOKEN,
    token_type: 'bearer',
    expires_in: expiresAt - Math.floor(Date.now() / 1_000),
    expires_at: expiresAt,
    user: E2E_USER,
  })
  return `base64-${Buffer.from(value).toString('base64url')}`
}

export default async function globalSetup(_config: FullConfig) {
  const value = encodedSession()
  const chunks = value.match(/.{1,3180}/g) ?? []
  await mkdir(dirname(authStatePath), { recursive: true })
  await writeFile(
    authStatePath,
    JSON.stringify({
      cookies: chunks.map((chunk, index) => ({
        name: chunks.length === 1 ? E2E_AUTH_COOKIE : `${E2E_AUTH_COOKIE}.${index}`,
        value: chunk,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: 4_102_444_800,
      })),
      origins: [],
    }),
  )
}
