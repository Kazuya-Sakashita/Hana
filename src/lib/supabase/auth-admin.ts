import 'server-only'

import { createClient } from '@supabase/supabase-js'

export function createSupabaseAuthAdminClient(options?: { signal?: AbortSignal }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase Auth admin environment is not configured')

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(options?.signal
      ? {
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, signal: options.signal }),
          },
        }
      : {}),
  })
}
