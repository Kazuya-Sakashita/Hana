import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IMG = '550e8400-e29b-41d4-a716-446655440000'

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

// Minimal sessionStorage stub for node env.
function makeSessionStorageStub(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
    get length() {
      return map.size
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  } satisfies Storage
}

describe('imageUrlCache', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: makeSessionStorageStub() })
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function load() {
    const mod = await import('@/lib/cache/image-url-cache')
    mod.imageUrlCache.clearAll()
    return mod.imageUrlCache
  }

  it('returns null for unknown entry', async () => {
    const cache = await load()
    expect(cache.get(IMG, 'thumbnail')).toBeNull()
  })

  it('returns stored URL within TTL', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(60_000))
    expect(cache.get(IMG, 'thumbnail')).toBe('https://example.com/a')
  })

  it('returns null when expiresAt is within the safety buffer', async () => {
    const cache = await load()
    // safety buffer = 30s. 10s ahead -> treat as expired.
    cache.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(10_000))
    expect(cache.get(IMG, 'thumbnail')).toBeNull()
  })

  it('isolates by size', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/thumb', isoFromNow(60_000))
    cache.set(IMG, 'preview', 'https://example.com/preview', isoFromNow(60_000))
    expect(cache.get(IMG, 'thumbnail')).toBe('https://example.com/thumb')
    expect(cache.get(IMG, 'preview')).toBe('https://example.com/preview')
  })

  it('persists to sessionStorage', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(60_000))
    const raw = window.sessionStorage.getItem(`hana:imageUrlCache:v2:${IMG}:thumbnail`)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { url: string; expiresAt: number }
    expect(parsed.url).toBe('https://example.com/a')
    expect(parsed.expiresAt).toBeGreaterThan(Date.now())
  })

  it('clearAll removes all session entries', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(60_000))
    cache.set(IMG, 'preview', 'https://example.com/b', isoFromNow(60_000))
    cache.clearAll()
    expect(cache.get(IMG, 'thumbnail')).toBeNull()
    expect(cache.get(IMG, 'preview')).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('clear removes only the targeted entry', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(60_000))
    cache.set(IMG, 'preview', 'https://example.com/b', isoFromNow(60_000))
    cache.clear(IMG, 'thumbnail')
    expect(cache.get(IMG, 'thumbnail')).toBeNull()
    expect(cache.get(IMG, 'preview')).toBe('https://example.com/b')
  })

  it('ignores invalid expiresAt strings', async () => {
    const cache = await load()
    cache.set(IMG, 'thumbnail', 'https://example.com/a', 'not-a-date')
    expect(cache.get(IMG, 'thumbnail')).toBeNull()
  })

  it('restores from sessionStorage after in-memory eviction', async () => {
    // Write via one module instance...
    const first = await load()
    first.set(IMG, 'thumbnail', 'https://example.com/a', isoFromNow(60_000))

    // ...reset modules so a fresh import only sees sessionStorage.
    vi.resetModules()
    const { imageUrlCache: fresh } = await import('@/lib/cache/image-url-cache')
    expect(fresh.get(IMG, 'thumbnail')).toBe('https://example.com/a')
  })
})
