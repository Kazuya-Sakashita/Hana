import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import {
  encodeCursor,
  parseListMemoriesQuery,
  parseMemoryCreate,
  readJsonBody,
} from '@/features/memories/server/parse'
import { toMemoryResponse } from '@/features/memories/view-models/memory'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const query = parseListMemoriesQuery(url)

    const items = await prisma.memory.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor.id }, skip: 1 } : {}),
      include: {
        images: {
          where: { deletedAt: null },
          select: { id: true, createdAt: true },
        },
      },
    })

    const hasMore = items.length > query.limit
    const page = hasMore ? items.slice(0, query.limit) : items
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(last.id) : null

    return NextResponse.json({
      data: page.map((m) => toMemoryResponse(m)),
      page: { next_cursor: nextCursor },
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw = await readJsonBody(request)
    const input = parseMemoryCreate(raw)

    // 1. child_id の所有権
    const child = await prisma.child.findFirst({
      where: { id: input.childId, deletedAt: null },
      select: { id: true, userId: true },
    })
    if (!child) {
      throw problems.notFound('指定した子どもが見つかりません')
    }
    if (child.userId !== user.id) {
      throw problems.forbidden()
    }

    // 2. image_ids の所有権 & 未紐付け検証
    const images = await prisma.image.findMany({
      where: { id: { in: input.imageIds }, deletedAt: null },
      select: { id: true, userId: true, memoryId: true },
    })
    if (images.length !== input.imageIds.length) {
      throw problems.validation([
        {
          path: 'body.image_ids',
          reason: 'image_not_found',
          message: '指定した画像の一部が見つかりません',
        },
      ])
    }
    const foreignImage = images.find((img) => img.userId !== user.id)
    if (foreignImage) {
      // 他人の画像 — 403 として情報を絞る
      throw problems.forbidden()
    }
    const alreadyLinked = images.find((img) => img.memoryId !== null)
    if (alreadyLinked) {
      throw problems.validation([
        {
          path: 'body.image_ids',
          reason: 'already_linked',
          message: '既に別の記録に紐付いている画像があります',
        },
      ])
    }

    // 3. トランザクションで memory 作成 + image 紐付け
    const created = await prisma.$transaction(async (tx) => {
      const memory = await tx.memory.create({
        data: {
          userId: user.id,
          childId: input.childId,
          title: input.title,
          body: input.body,
          recordedAt: input.recordedAt,
          weather: input.weather,
          aiGenerated: input.aiGenerated,
        },
      })
      await tx.image.updateMany({
        where: { id: { in: input.imageIds }, userId: user.id, memoryId: null },
        data: { memoryId: memory.id },
      })
      return tx.memory.findUniqueOrThrow({
        where: { id: memory.id },
        include: {
          images: { where: { deletedAt: null }, select: { id: true, createdAt: true } },
        },
      })
    })

    return NextResponse.json(toMemoryResponse(created), { status: 201 })
  } catch (e) {
    return toProblemResponse(e)
  }
}
