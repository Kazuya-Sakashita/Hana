'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function shouldClearQueryCacheOnAuthChange({
  event,
  previousUserId,
  currentUserId,
}: {
  event: AuthChangeEvent
  previousUserId: string | null
  currentUserId: string | null
}): boolean {
  if (event === 'INITIAL_SESSION') return false
  if (event === 'SIGNED_OUT') return true
  return previousUserId !== currentUserId
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
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    supabaseRef.current ??= createSupabaseBrowserClient()
    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user.id ?? null
      if (
        shouldClearQueryCacheOnAuthChange({
          event,
          previousUserId: currentUserIdRef.current,
          currentUserId,
        })
      ) {
        queryClient.clear()
      }
      currentUserIdRef.current = currentUserId
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
