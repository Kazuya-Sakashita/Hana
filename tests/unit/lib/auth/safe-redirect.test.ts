import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  oauthCallbackUrl,
  publicAppOrigin,
  safeAuthReturnPath,
  safeInternalRedirectPath,
  signInPath,
} from '@/lib/auth/safe-redirect'

describe('safeInternalRedirectPath', () => {
  it.each([
    ['/album', '/album'],
    ['/album?month=2026-07', '/album?month=2026-07'],
    ['/memory/synthetic-id#story', '/memory/synthetic-id#story'],
  ])('allows internal absolute paths: %s', (input, expected) => {
    expect(safeInternalRedirectPath(input)).toBe(expected)
  })

  it.each([
    null,
    '',
    'album',
    'https://attacker.example/path',
    '//attacker.example/path',
    '///attacker.example/path',
    '/\\attacker.example/path',
    '/album\\settings',
    '/album\u0000',
    '/album\nsettings',
    '/%2e%2e//attacker.example/path',
  ])('falls back for an unsafe redirect: %s', (input) => {
    expect(safeInternalRedirectPath(input)).toBe('/')
  })
})

describe('safeAuthReturnPath', () => {
  it.each([
    ['/record?private=synthetic-text#draft', '/record'],
    ['/album?month=2026-07&private=synthetic-text', '/album?month=2026-07'],
    ['/album?month=invalid', '/album'],
    ['/memory/synthetic-id?saved=1&token=secret', '/memory/synthetic-id?saved=1'],
    ['/memory/synthetic-id?saved=0', '/memory/synthetic-id'],
  ])('keeps only route-specific allowlisted state: %s', (input, expected) => {
    expect(safeAuthReturnPath(input)).toBe(expected)
  })
})

describe('publicAppOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['https://hana.example/app', 'https://hana.example'],
    ['http://localhost:3000/path', 'http://localhost:3000'],
  ])('returns the configured HTTP origin: %s', (input, expected) => {
    expect(publicAppOrigin(input)).toBe(expected)
  })

  it.each([
    '',
    'not-a-url',
    'javascript:alert(1)',
    'http://attacker.example',
    'https://user:secret@attacker.example',
  ])('falls back to the Hana origin for an unsafe app URL: %s', (input) => {
    expect(publicAppOrigin(input)).toBe('https://hana.app')
  })

  it('reads the configured public origin when no argument is provided', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    expect(publicAppOrigin()).toBe('http://localhost:3000')
  })

  it('uses the fail-safe origin when the public app environment is empty', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(publicAppOrigin()).toBe('https://hana.app')
  })
})

describe('signInPath', () => {
  it('encodes a safe return path', () => {
    expect(signInPath('/album?month=2026-07')).toBe('/sign-in?next=%2Falbum%3Fmonth%3D2026-07')
  })

  it.each([undefined, '/', '//attacker.example/path'])(
    'omits next when the return path is not useful or unsafe: %s',
    (input) => {
      expect(signInPath(input)).toBe('/sign-in')
    },
  )
})

describe('oauthCallbackUrl', () => {
  it('forwards a validated internal return path', () => {
    expect(oauthCallbackUrl('https://hana.example/app', '/record?step=story')).toBe(
      'https://hana.example/auth/callback?next=%2Frecord',
    )
  })

  it('does not forward an external return path', () => {
    expect(oauthCallbackUrl('https://hana.example', '//attacker.example/path')).toBe(
      'https://hana.example/auth/callback',
    )
  })
})
