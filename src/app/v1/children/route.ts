import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { withChildPersistence } from '@/server/db/child-persistence'
import { toChildResponse } from '@/features/children/view-models/child'
import { parseChildCreate, readJsonBody } from '@/features/children/server/parse'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    const children = await withChildPersistence(user.id, ({ transaction }) =>
      transaction.child.findMany({
        where: { userId: user.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    )
    return NextResponse.json({ data: children.map(toChildResponse) })
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw = await readJsonBody(request)
    const input = parseChildCreate(raw)

    try {
      const child = await withChildPersistence(user.id, async ({ transaction }) => {
        const existing = await transaction.child.findFirst({
          where: { userId: user.id, deletedAt: null },
          select: { id: true },
        })
        if (existing) throw problems.childLimitReached()

        return transaction.child.create({
          data: {
            userId: user.id,
            name: input.name,
            birthdate: input.birthdate,
            avatarUrl: input.avatarUrl,
          },
        })
      })
      return NextResponse.json(toChildResponse(child), { status: 201 })
    } catch (dbErr) {
      // 並行 POST で partial unique index に当たった場合は 409 に正規化
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        throw problems.childLimitReached()
      }
      throw dbErr
    }
  } catch (e) {
    return toProblemResponse(e)
  }
}
