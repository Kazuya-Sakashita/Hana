import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { isUuid, parseMemoryUpdate, readJsonBody } from '@/features/memories/server/parse'
import { toMemoryResponse } from '@/features/memories/view-models/memory'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ memoryId: string }> }

async function loadMemory(memoryId: string) {
  if (!isUuid(memoryId)) {
    throw problems.notFound('記録が見つかりません')
  }
  const memory = await prisma.memory.findFirst({
    where: { id: memoryId, deletedAt: null },
    include: {
      images: { where: { deletedAt: null }, select: { id: true, createdAt: true } },
    },
  })
  if (!memory) {
    throw problems.notFound('記録が見つかりません')
  }
  return memory
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { memoryId } = await params
    const memory = await loadMemory(memoryId)
    if (memory.userId !== user.id) throw problems.forbidden()
    return NextResponse.json(toMemoryResponse(memory))
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { memoryId } = await params
    const memory = await loadMemory(memoryId)
    if (memory.userId !== user.id) throw problems.forbidden()

    const raw = await readJsonBody(request)
    const patch = parseMemoryUpdate(raw)

    const updated = await prisma.memory.update({
      where: { id: memory.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.weather !== undefined ? { weather: patch.weather } : {}),
        ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
      },
      include: {
        images: { where: { deletedAt: null }, select: { id: true, createdAt: true } },
      },
    })
    return NextResponse.json(toMemoryResponse(updated))
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { memoryId } = await params
    const memory = await loadMemory(memoryId)
    if (memory.userId !== user.id) throw problems.forbidden()

    await prisma.memory.update({
      where: { id: memory.id },
      data: { deletedAt: new Date() },
    })
    return new Response(null, { status: 204 })
  } catch (e) {
    return toProblemResponse(e)
  }
}
