import 'server-only'

import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/supabase/types'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'

// Supabase の auth.users と Hana 固有 profiles を結合し、Hana のドメイン用 AppUser を返す。
// 初回ログイン時に profile が無ければ作成 (lazy insert)。
//
// ISSUE-017: React 19 `cache()` で **同一 request 内** の重複呼び出しを deduplicate。
// 将来 Server Component から多重に呼ばれても DB は 1 回だけ叩く。
// scope: 同一 render (Server Component / Route Handler 内) で共有、 リクエスト跨ぎはしない。

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // ISSUE-017: upsert を捨て findUnique + 必要なら create に変える。
  // hot path (既存ユーザー): findUnique は PK lookup で超速、 INSERT/UPDATE 不要。
  // cold path (初回サインイン): create のみ走る。
  let profile = await prisma.profile.findUnique({ where: { id: user.id } })
  if (!profile) {
    profile = await prisma.profile.create({ data: { id: user.id } })
  }

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile.displayName,
    aiConsentAt: profile.aiConsentAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
  }
})

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) throw problems.unauthorized()
  return user
}

export function requireOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) throw problems.forbidden()
}
