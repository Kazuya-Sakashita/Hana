'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function shouldClearQueryCacheOnAuthChange(event: AuthChangeEvent): boolean {
  return event !== 'INITIAL_SESSION'
}

export function QueryProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
          },
        },
      }),
  )
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null)

  useEffect(() => {
    supabaseRef.current ??= createSupabaseBrowserClient()
    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange((event) => {
      if (shouldClearQueryCacheOnAuthChange(event)) {
        queryClient.clear()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
