import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { childAccessStatus, withChildOwnerScope } from '@/server/db/child-owner-scope'
import { toChildResponse } from '@/features/children/view-models/child'
import { isUuid, parseChildUpdate, readJsonBody } from '@/features/children/server/parse'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ childId: string }> }

async function loadChild(transaction: Prisma.TransactionClient, childId: string) {
  if (!isUuid(childId)) {
    throw problems.notFound('子どもプロフィールが見つかりません')
  }
  const child = await transaction.child.findFirst({
    where: { id: childId, deletedAt: null },
  })
  if (!child) {
    const status = await childAccessStatus(transaction, childId)
    if (status === 'foreign') throw problems.forbidden()
    if (status === 'owned') throw new Error('child_owner_scope_mismatch')
    throw problems.notFound('子どもプロフィールが見つかりません')
  }
  return child
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { childId } = await params
    const child = await withChildOwnerScope(user.id, (transaction) =>
      loadChild(transaction, childId),
    )
    return NextResponse.json(toChildResponse(child))
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { childId } = await params
    const child = await withChildOwnerScope(user.id, (transaction) =>
      loadChild(transaction, childId),
    )

    const raw = await readJsonBody(request)
    const patch = parseChildUpdate(raw)

    const updated = await withChildOwnerScope(user.id, (transaction) =>
      transaction.child.update({
        where: { id: child.id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.birthdate !== undefined ? { birthdate: patch.birthdate } : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        },
      }),
    )
    return NextResponse.json(toChildResponse(updated))
  } catch (e) {
    return toProblemResponse(e)
  }
}
