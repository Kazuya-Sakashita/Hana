import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { type ChildPersistenceScope, withChildPersistence } from '@/server/db/child-persistence'
import { toChildResponse } from '@/features/children/view-models/child'
import {
  isUuid,
  parseChildUpdate,
  parseJsonBodyText,
  readJsonBodyText,
} from '@/features/children/server/parse'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ childId: string }> }

async function loadChild(scope: ChildPersistenceScope, childId: string, userId: string) {
  if (!isUuid(childId)) {
    throw problems.notFound('子どもプロフィールが見つかりません')
  }
  const child = await scope.transaction.child.findFirst({
    where: { id: childId, userId, deletedAt: null },
  })
  if (!child) {
    const status = await scope.accessStatus(childId)
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
    const child = await withChildPersistence(user.id, (scope) => loadChild(scope, childId, user.id))
    return NextResponse.json(toChildResponse(child))
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { childId } = await params
    const bodyText = await readJsonBodyText(request)

    const updated = await withChildPersistence(user.id, async (scope) => {
      const child = await loadChild(scope, childId, user.id)
      const patch = parseChildUpdate(parseJsonBodyText(bodyText))
      return scope.transaction.child.update({
        where: { id: child.id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.birthdate !== undefined ? { birthdate: patch.birthdate } : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        },
      })
    })
    return NextResponse.json(toChildResponse(updated))
  } catch (e) {
    return toProblemResponse(e)
  }
}
