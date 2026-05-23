import 'server-only'

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { readSupabaseEnv } from '@/lib/supabase/types'

// Server Components / Route Handlers から Supabase Auth セッションを cookie 経由で読む。
// `cookies()` は Next.js が request-scoped に提供するため、リクエスト毎に新しい client を作る。

export async function createSupabaseServerClient() {
  const { url, anonKey } = readSupabaseEnv()
  const cookieStore = await cookies()

  const cookieAdapter: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      // Server Components から呼ばれた場合 cookieStore.set は no-op になり得るが、
      // Route Handler / Server Action からは成功する。境界差は @supabase/ssr が吸収する。
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      } catch {
        // Server Component 内ではここに来る。後段で Auth が必要な処理は Route Handler に置く。
      }
    },
  }

  return createServerClient(url, anonKey, { cookies: cookieAdapter })
}
