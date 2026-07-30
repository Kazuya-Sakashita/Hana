import { createApiClient } from '@/lib/api/client'

// Client Components / hooks 用の API クライアント。
// 同一 origin の Supabase session cookie を使う。
// Bearer token を重ねると認証情報が二重になり、header size 上限を超えるため追加しない。

let cachedClient: ReturnType<typeof createApiClient> | null = null

export function getBrowserApiClient() {
  if (cachedClient) return cachedClient
  cachedClient = createApiClient({ baseUrl: '/v1' })
  return cachedClient
}
