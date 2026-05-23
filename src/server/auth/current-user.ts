import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/supabase/types'
import { problems } from '@/server/api/problems'
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

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) throw problems.unauthorized()
  return user
}

export function requireOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) throw problems.forbidden()
}
