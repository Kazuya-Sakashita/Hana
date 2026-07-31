import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Image } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  runImageVariantRepairs,
  VariantRepairError,
  type ImageVariantRepairStorage,
} from '@/features/uploads/server/image-variant-repair'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'

const enabled = process.env.ISSUE_142_DATABASE_QA === '1'
const describeDatabase = enabled ? describe : describe.skip
const NOW = new Date('2026-07-31T12:00:00.000Z')

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

describeDatabase('ISSUE-142 PostgreSQL integration', () => {
  let prisma: PrismaClient
  const profileIds: string[] = []

  beforeAll(() => {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('database_url_required')
    const url = new URL(connectionString)
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('local_database_required')
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.profile.deleteMany({ where: { id: { in: profileIds } } })
    await prisma.$disconnect()
  })

  async function createImage(overrides: Partial<Image> = {}) {
    const profileId = randomUUID()
    profileIds.push(profileId)
    await prisma.profile.create({ data: { id: profileId } })
    return prisma.image.create({
      data: {
        userId: profileId,
        storageKey: `uploads/synthetic/202607/${randomUUID()}.jpg`,
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        fileSize: 1,
        metadataSanitizedAt: NOW,
        variantRepairNextAt: new Date(NOW.getTime() - 1),
        ...overrides,
      },
    })
  }

  it('commits the claim and recovers after a temporary Storage failure', async () => {
    const image = await createImage()
    const objects = new Set([image.storageKey, deriveVariantKey(image.storageKey, 'preview')])
    let temporaryFailure = true
    let observedCommittedClaim = false
    const generate = vi.fn(
      async (
        storageKey: string,
        _original: Buffer,
        requested: { thumbnail: boolean; preview: boolean },
      ) => {
        if (requested.thumbnail) objects.add(deriveVariantKey(storageKey, 'thumbnail'))
        if (requested.preview) objects.add(deriveVariantKey(storageKey, 'preview'))
        return { thumbnail: 'ready' as const, preview: 'ready' as const }
      },
    )
    const storage: ImageVariantRepairStorage = {
      exists: async (key) => {
        const state = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })
        observedCommittedClaim ||=
          state.variantRepairStatus === 'claimed' && state.variantRepairClaimToken !== null
        if (temporaryFailure) {
          temporaryFailure = false
          throw new VariantRepairError('storage_unavailable')
        }
        return objects.has(key)
      },
      loadOriginal: async () => Buffer.from('synthetic-original'),
      generate,
    }

    const first = await runImageVariantRepairs(prisma, storage, { apply: true, now: NOW })
    const failedState = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })

    expect(first.retried).toBe(1)
    expect(observedCommittedClaim).toBe(true)
    expect(failedState).toMatchObject({
      variantRepairStatus: 'pending',
      variantRepairAttempts: 1,
      variantRepairFailureReason: 'storage_unavailable',
      variantRepairClaimToken: null,
    })

    const retryTime = new Date(NOW.getTime() + 3 * 60_000)
    const second = await runImageVariantRepairs(prisma, storage, {
      apply: true,
      now: retryTime,
    })
    const recoveredState = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })

    expect(second.repaired).toBe(1)
    expect(generate).toHaveBeenCalledWith(image.storageKey, Buffer.from('synthetic-original'), {
      thumbnail: true,
      preview: false,
    })
    expect(recoveredState).toMatchObject({
      originalVariantStatus: 'ready',
      thumbnailVariantStatus: 'ready',
      previewVariantStatus: 'ready',
      variantRepairStatus: 'complete',
      variantRepairAttempts: 0,
      variantRepairFailureReason: null,
    })
  })

  it('persists backoff after the Storage transaction times out', async () => {
    const image = await createImage()
    const storage: ImageVariantRepairStorage = {
      exists: async () => {
        await delay(80)
        return true
      },
      loadOriginal: async () => Buffer.from('unused'),
      generate: async () => ({ thumbnail: 'ready', preview: 'ready' }),
    }

    const result = await runImageVariantRepairs(prisma, storage, {
      apply: true,
      now: NOW,
      workTimeoutMs: 50,
    })
    const state = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })

    expect(result.retried).toBe(1)
    expect(state).toMatchObject({
      variantRepairStatus: 'pending',
      variantRepairAttempts: 1,
      variantRepairFailureReason: 'processing_timeout',
      variantRepairClaimToken: null,
    })
    expect(state.variantRepairNextAt > NOW).toBe(true)
  })

  it('reclaims a stale committed claim after the lease expires', async () => {
    const image = await createImage({
      variantRepairStatus: 'claimed',
      variantRepairClaimToken: randomUUID(),
      variantRepairClaimedAt: new Date(NOW.getTime() - 11 * 60_000),
    })
    const storage: ImageVariantRepairStorage = {
      exists: async () => true,
      loadOriginal: async () => Buffer.from('unused'),
      generate: async () => ({ thumbnail: 'ready', preview: 'ready' }),
    }

    const result = await runImageVariantRepairs(prisma, storage, { apply: true, now: NOW })
    const state = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })

    expect(result.alreadyReady).toBe(1)
    expect(state).toMatchObject({
      variantRepairStatus: 'complete',
      variantRepairClaimToken: null,
      variantRepairClaimedAt: null,
    })
  })

  it('lets a concurrent deletion wait for repair and then preserves deletion', async () => {
    const image = await createImage()
    const workStarted = deferred()
    const releaseStorage = deferred()
    let signaled = false
    const storage: ImageVariantRepairStorage = {
      exists: async () => {
        if (!signaled) {
          signaled = true
          workStarted.resolve()
        }
        await releaseStorage.promise
        return true
      },
      loadOriginal: async () => Buffer.from('unused'),
      generate: async () => ({ thumbnail: 'ready', preview: 'ready' }),
    }

    const repair = runImageVariantRepairs(prisma, storage, { apply: true, now: NOW })
    await workStarted.promise
    let deletionSettled = false
    const deletion = prisma
      .$transaction(async (transaction) => {
        await lockImageAccess(transaction, [image.id])
        await transaction.image.update({ where: { id: image.id }, data: { deletedAt: NOW } })
      })
      .finally(() => {
        deletionSettled = true
      })

    await delay(50)
    expect(deletionSettled).toBe(false)
    releaseStorage.resolve()
    const [repairResult] = await Promise.all([repair, deletion])
    const state = await prisma.image.findUniqueOrThrow({ where: { id: image.id } })

    expect(repairResult.alreadyReady).toBe(1)
    expect(state.deletedAt).toEqual(NOW)
  })

  it('does not touch Storage when deletion wins the image lock', async () => {
    const image = await createImage()
    const deletionLocked = deferred()
    const releaseDeletion = deferred()
    const deletion = prisma.$transaction(async (transaction) => {
      await lockImageAccess(transaction, [image.id])
      deletionLocked.resolve()
      await releaseDeletion.promise
      await transaction.image.update({ where: { id: image.id }, data: { deletedAt: NOW } })
    })
    await deletionLocked.promise

    const storage: ImageVariantRepairStorage = {
      exists: vi.fn(async () => true),
      loadOriginal: vi.fn(async () => Buffer.from('unused')),
      generate: vi.fn(async () => ({
        thumbnail: 'ready' as const,
        preview: 'ready' as const,
      })),
    }
    const repair = runImageVariantRepairs(prisma, storage, { apply: true, now: NOW })
    await delay(50)
    releaseDeletion.resolve()
    const [, result] = await Promise.all([deletion, repair])

    expect(result.protected).toBe(1)
    expect(storage.exists).not.toHaveBeenCalled()
  })
})
