import 'server-only'

import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/supabase/types'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type VerifiedSessionIdentity = {
  subject: string
  sessionId: string
}

// Supabase の auth.users と Hana 固有 profiles を結合し、Hana のドメイン用 AppUser を返す。
// Profile 作成は OAuth callback に限定し、退会済み subject を通常リクエストで復活させない。
//
// ISSUE-017: React 19 `cache()` で **同一 request 内** の重複呼び出しを deduplicate。
// 将来 Server Component から多重に呼ばれても DB は 1 回だけ叩く。
// scope: 同一 render (Server Component / Route Handler 内) で共有、 リクエスト跨ぎはしない。

export const getAuthenticatedAccount = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await prisma.profile.findUnique({ where: { id: user.id } })
  return { authUser: user, profile }
})

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const account = await getAuthenticatedAccount()
  if (!account?.profile || account.profile.accessBlockedAt) return null
  const { authUser: user, profile } = account

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile.displayName,
    aiConsentAt: profile.aiConsentAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
  }
})

export const getVerifiedSessionIdentity = cache(
  async (): Promise<VerifiedSessionIdentity | null> => {
    const account = await getAuthenticatedAccount()
    if (!account) return null

    const supabase = await createSupabaseServerClient()
    let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>
    try {
      claimsResult = await supabase.auth.getClaims()
    } catch {
      return null
    }
    const { data, error } = claimsResult
    if (error) return null

    const subject = data?.claims.sub
    const sessionId = data?.claims.session_id
    if (
      typeof subject !== 'string' ||
      typeof sessionId !== 'string' ||
      !UUID_PATTERN.test(subject) ||
      !UUID_PATTERN.test(sessionId) ||
      subject !== account.authUser.id
    ) {
      return null
    }

    return { subject, sessionId }
  },
)

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) throw problems.unauthorized()
  return user
}

export async function requireVerifiedSessionIdentity(): Promise<VerifiedSessionIdentity> {
  const identity = await getVerifiedSessionIdentity()
  if (!identity) throw problems.unauthorized()
  return identity
}

export async function requireAuthenticatedAccount() {
  const account = await getAuthenticatedAccount()
  if (!account?.profile) throw problems.unauthorized()
  return account
}

export function requireOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) throw problems.forbidden()
}
