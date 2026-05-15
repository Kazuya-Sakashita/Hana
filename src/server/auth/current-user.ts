import 'server-only'

import { ApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/supabase/types'
import { prisma } from '@/server/db/prisma'

// Supabase の auth.users と Hana 固有 profiles を結合し、Hana のドメイン用 AppUser を返す。
// 初回ログイン時に profile が無ければ作成 (lazy insert)。

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id },
    update: {},
  })

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile.displayName,
    aiConsentAt: profile.aiConsentAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
  }
}

function problem(
  reason: 'unauthorized' | 'forbidden',
  status: 401 | 403,
  detail: string,
): ApiProblemError {
  const problemDetails: ProblemDetails = {
    type: `https://hana.app/problems/${reason.replace(/_/g, '-')}`,
    title: status === 401 ? 'Unauthorized' : 'Forbidden',
    status,
    reason,
    detail,
  }
  return new ApiProblemError(problemDetails)
}

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw problem('unauthorized', 401, 'サインインが必要です')
  }
  return user
}

export function requireOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) {
    throw problem('forbidden', 403, 'このリソースへのアクセス権がありません')
  }
}
