// Supabase の auth.users から Hana 固有の AppUser への変換ロジックは
// 認可ヘルパ (src/server/auth/) 側で行う。ここでは型のみ集約する。

export type AppUser = {
  id: string
  email: string | null
  displayName: string | null
  aiConsentAt: string | null
  createdAt: string
}

export type SupabaseEnv = {
  url: string
  anonKey: string
}

export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. See docs/api-driven-development/db-setup.md',
    )
  }
  return { url, anonKey }
}
