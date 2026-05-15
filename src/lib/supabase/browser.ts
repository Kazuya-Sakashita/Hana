import { createBrowserClient } from '@supabase/ssr'
import { readSupabaseEnv } from '@/lib/supabase/types'

export function createSupabaseBrowserClient() {
  const { url, anonKey } = readSupabaseEnv()
  return createBrowserClient(url, anonKey)
}
