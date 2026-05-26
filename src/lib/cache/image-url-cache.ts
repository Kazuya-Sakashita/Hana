'use client'

// 画像 signed URL のクライアントキャッシュ (ADR-0012)。
// 同一画像 × 同一サイズの URL を TTL 内で再取得しない。
// - in-memory: タブ生存中の超高速 hit
// - sessionStorage: タブ生存中なら永続化、 タブ閉じで自動失効

type ImageSize = 'thumbnail' | 'preview' | 'original'

type CacheEntry = {
  url: string
  expiresAt: number // epoch ms
}

const STORAGE_KEY_PREFIX = 'hana:imageUrlCache:'
const SAFETY_BUFFER_MS = 30_000 // 30 秒前に失効扱い (URL TTL ギリギリで叩かない)

const memory = new Map<string, CacheEntry>()

function makeKey(imageId: string, size: ImageSize): string {
  return `${imageId}:${size}`
}

function readSession(key: string): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (typeof parsed.url !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(key: string, entry: CacheEntry): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(entry))
  } catch {
    // QuotaExceeded など。 in-memory には残るので致命的ではない
  }
}

function deleteSession(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY_PREFIX + key)
  } catch {
    // ignore
  }
}

export const imageUrlCache = {
  /**
   * 有効な URL があれば返す。 期限切れ・未登録は null。
   */
  get(imageId: string, size: ImageSize): string | null {
    const key = makeKey(imageId, size)
    const now = Date.now()

    let entry = memory.get(key) ?? readSession(key)
    if (entry && entry.expiresAt - SAFETY_BUFFER_MS > now) {
      memory.set(key, entry)
      return entry.url
    }
    if (entry) {
      // 期限切れ → 自前で掃除
      memory.delete(key)
      deleteSession(key)
      entry = null
    }
    return null
  },

  set(imageId: string, size: ImageSize, url: string, expiresAtIso: string): void {
    const expiresAt = Date.parse(expiresAtIso)
    if (!Number.isFinite(expiresAt)) return
    const key = makeKey(imageId, size)
    const entry: CacheEntry = { url, expiresAt }
    memory.set(key, entry)
    writeSession(key, entry)
  },

  clear(imageId: string, size: ImageSize): void {
    const key = makeKey(imageId, size)
    memory.delete(key)
    deleteSession(key)
  },

  /**
   * 全エントリ削除。 サインアウト時に呼ぶ。
   */
  clearAll(): void {
    memory.clear()
    if (typeof window === 'undefined') return
    try {
      const keys: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && k.startsWith(STORAGE_KEY_PREFIX)) keys.push(k)
      }
      for (const k of keys) window.sessionStorage.removeItem(k)
    } catch {
      // ignore
    }
  },
}

export type { ImageSize }
