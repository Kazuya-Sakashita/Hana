import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { toChildResponse } from '@/features/children/view-models/child'
import { isUuid, parseChildUpdate, readJsonBody } from '@/features/children/server/parse'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ childId: string }> }

async function loadChild(childId: string) {
  if (!isUuid(childId)) {
    throw problems.notFound('子どもプロフィールが見つかりません')
  }
  const child = await prisma.child.findFirst({
    where: { id: childId, deletedAt: null },
  })
  if (!child) {
    throw problems.notFound('子どもプロフィールが見つかりません')
  }
  return child
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { childId } = await params
    const child = await loadChild(childId)
    if (child.userId !== user.id) throw problems.forbidden()
    return NextResponse.json(toChildResponse(child))
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { childId } = await params
    const child = await loadChild(childId)
    if (child.userId !== user.id) throw problems.forbidden()

    const raw = await readJsonBody(request)
    const patch = parseChildUpdate(raw)

    const updated = await prisma.child.update({
      where: { id: child.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.birthdate !== undefined ? { birthdate: patch.birthdate } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      },
    })
    return NextResponse.json(toChildResponse(updated))
  } catch (e) {
    return toProblemResponse(e)
  }
}
