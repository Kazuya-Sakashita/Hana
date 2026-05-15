import { createApiClient } from '@/lib/api/client'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

// Client Components / hooks 用の API クライアント。
// resolveAuthToken は Supabase の localStorage ベース session から取得する。

let cachedClient: ReturnType<typeof createApiClient> | null = null

export function getBrowserApiClient() {
  if (cachedClient) return cachedClient
  const supabase = createSupabaseBrowserClient()
  cachedClient = createApiClient({
    baseUrl: '/v1',
    resolveAuthToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session?.access_token ?? null
    },
  })
  return cachedClient
}
