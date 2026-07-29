import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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
import { countMemories, fetchMemoriesWithCovers } from '@/features/memories/server/queries'
import {
  memoryMatchesCreateInput,
  parseMemoryIdempotencyKey,
} from '@/features/memories/server/idempotency'
import { toMemoryResponse } from '@/features/memories/view-models/memory'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const query = parseListMemoriesQuery(url)

    // ISSUE-026: 共通 server function に抽出 (Server Component と共有)
    const [{ items, hasMore }, totalCount] = await Promise.all([
      fetchMemoriesWithCovers({
        userId: user.id,
        limit: query.limit,
        cursorId: query.cursor?.id ?? null,
        recordedFrom: query.recordedFrom,
        recordedBefore: query.recordedBefore,
      }),
      countMemories({
        userId: user.id,
        recordedFrom: query.recordedFrom,
        recordedBefore: query.recordedBefore,
      }),
    ])

    const last = items[items.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(last.id) : null

    return NextResponse.json({
      data: items.map(({ coverThumbnailUrl, ...memory }) =>
        toMemoryResponse(memory, { coverThumbnailUrl }),
      ),
      page: { next_cursor: nextCursor, total_count: totalCount },
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const idempotencyKey = parseMemoryIdempotencyKey(request)
    const raw = await readJsonBody(request)
    const input = parseMemoryCreate(raw)

    const findExisting = () =>
      prisma.memory.findFirst({
        where: { userId: user.id, idempotencyKey },
        include: {
          images: {
            where: { deletedAt: null },
            select: { id: true, createdAt: true, memoryPosition: true },
          },
        },
      })
    const existing = await findExisting()
    if (existing) {
      if (!memoryMatchesCreateInput(existing, input)) {
        throw problems.memoryIdempotencyConflict()
      }
      return NextResponse.json(toMemoryResponse(existing), { status: 200 })
    }

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
    try {
      const created = await prisma.$transaction(async (tx) => {
        const memory = await tx.memory.create({
          data: {
            userId: user.id,
            childId: input.childId,
            idempotencyKey,
            title: input.title,
            body: input.body,
            recordedAt: input.recordedAt,
            weather: input.weather,
            aiGenerated: input.aiGenerated,
          },
        })
        for (const [memoryPosition, imageId] of input.imageIds.entries()) {
          const linked = await tx.image.updateMany({
            where: { id: imageId, userId: user.id, memoryId: null, deletedAt: null },
            data: { memoryId: memory.id, memoryPosition },
          })
          if (linked.count !== 1) {
            throw problems.validation([
              {
                path: 'body.image_ids',
                reason: 'already_linked',
                message: '既に別の記録に紐付いている画像があります',
              },
            ])
          }
        }
        return tx.memory.findUniqueOrThrow({
          where: { id: memory.id },
          include: {
            images: {
              where: { deletedAt: null },
              select: { id: true, createdAt: true, memoryPosition: true },
            },
          },
        })
      })

      return NextResponse.json(toMemoryResponse(created), { status: 201 })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentlyCreated = await findExisting()
        if (concurrentlyCreated) {
          if (!memoryMatchesCreateInput(concurrentlyCreated, input)) {
            throw problems.memoryIdempotencyConflict()
          }
          return NextResponse.json(toMemoryResponse(concurrentlyCreated), { status: 200 })
        }
      }
      throw error
    }
  } catch (e) {
    return toProblemResponse(e)
  }
}
