const DEFAULT_REDIRECT_PATH = '/'
const DEFAULT_APP_ORIGIN = 'https://hana.app'
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const ALBUM_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function isUnsafeInternalPath(value: string): boolean {
  return (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(value)
  )
}

export function safeInternalRedirectPath(value: string | null | undefined): string {
  if (!value || isUnsafeInternalPath(value)) {
    return DEFAULT_REDIRECT_PATH
  }

  try {
    const base = new URL('https://hana.invalid')
    const target = new URL(value, base)
    if (target.origin !== base.origin) return DEFAULT_REDIRECT_PATH
    const normalizedPath = `${target.pathname}${target.search}${target.hash}`
    return isUnsafeInternalPath(normalizedPath) ? DEFAULT_REDIRECT_PATH : normalizedPath
  } catch {
    return DEFAULT_REDIRECT_PATH
  }
}

export function safeAuthReturnPath(value: string | null | undefined): string {
  const safePath = safeInternalRedirectPath(value)
  const url = new URL(safePath, 'https://hana.invalid')

  if (url.pathname === '/album') {
    const month = url.searchParams.get('month')
    return month && ALBUM_MONTH_PATTERN.test(month)
      ? `/album?month=${encodeURIComponent(month)}`
      : '/album'
  }

  if (/^\/memory\/[^/]+$/.test(url.pathname) && url.searchParams.get('saved') === '1') {
    return `${url.pathname}?saved=1`
  }

  return url.pathname
}

export function publicAppOrigin(value = process.env.NEXT_PUBLIC_APP_URL): string {
  if (!value) return DEFAULT_APP_ORIGIN

  try {
    const url = new URL(value)
    const isDevelopmentHttp =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    if ((url.protocol !== 'https:' && !isDevelopmentHttp) || url.username || url.password) {
      return DEFAULT_APP_ORIGIN
    }
    return url.origin
  } catch {
    return DEFAULT_APP_ORIGIN
  }
}

export function signInPath(next: string | null | undefined): string {
  const safeNext = safeAuthReturnPath(next)
  return safeNext === DEFAULT_REDIRECT_PATH
    ? '/sign-in'
    : `/sign-in?next=${encodeURIComponent(safeNext)}`
}

export function oauthCallbackUrl(
  appUrl: string | null | undefined,
  next: string | null | undefined,
): string {
  const callbackUrl = new URL('/auth/callback', publicAppOrigin(appUrl ?? undefined))
  const safeNext = safeAuthReturnPath(next)
  if (safeNext !== DEFAULT_REDIRECT_PATH) {
    callbackUrl.searchParams.set('next', safeNext)
  }
  return callbackUrl.toString()
}
