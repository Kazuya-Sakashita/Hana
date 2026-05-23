import 'server-only'

import { createApiClient } from '@/lib/api/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Server Components / Route Handlers 用の API クライアント。
// resolveAuthToken は Supabase の cookie ベース session から取得する。

export async function createServerApiClient() {
  const supabase = await createSupabaseServerClient()
  return createApiClient({
    baseUrl: '/v1',
    resolveAuthToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session?.access_token ?? null
    },
  })
}
