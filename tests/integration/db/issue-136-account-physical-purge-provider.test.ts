import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { assertIssue136PurgeQaEnvironment } from '../../support/issue-136-environment'

const qaEnabled = process.env.ISSUE_136_PURGE_QA === '1'
const serviceRoleKey = 'synthetic-service-role-key'
const cronSecret = 'synthetic-cron-secret'
const fixtureTimestamp = '2020-01-01T00:00:00.000Z'
const userId = '00000000-0000-4000-8000-000000000136'
const childId = '00000000-0000-4000-8000-000000000137'
const memoryId = '00000000-0000-4000-8000-000000000138'
const imageId = '00000000-0000-4000-8000-000000000139'
const generationId = '00000000-0000-4000-8000-000000000140'
const requestId = '00000000-0000-4000-8000-000000000141'
const otherUserId = '00000000-0000-4000-8000-000000000150'
const otherImageId = '00000000-0000-4000-8000-000000000151'
const otherRequestId = '00000000-0000-4000-8000-000000000152'

interface StoredObject {
  body: Buffer
  createdAt: string
  updatedAt: string
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function providerFixture(
  objects: Map<string, StoredObject>,
  authUsers: Set<string>,
  canDeleteAuthUser: (userId: string) => Promise<boolean>,
) {
  return createServer((request, response) => {
    void (async () => {
      if (request.headers.authorization !== `Bearer ${serviceRoleKey}`) {
        return json(response, 401, { message: 'Synthetic fixture rejected' })
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/storage/v1/object/list/images' && request.method === 'POST') {
        const body = await readJson(request)
        const prefix = typeof body.prefix === 'string' ? body.prefix.replace(/\/$/, '') : ''
        const offset = typeof body.offset === 'number' ? body.offset : 0
        const limit = typeof body.limit === 'number' ? body.limit : 100
        const entries = new Map<string, Record<string, unknown>>()
        for (const [key, object] of objects) {
          if (!key.startsWith(`${prefix}/`)) continue
          const remainder = key.slice(prefix.length + 1)
          const separator = remainder.indexOf('/')
          const name = separator === -1 ? remainder : remainder.slice(0, separator)
          const nested = separator !== -1
          entries.set(
            name,
            nested
              ? { id: null, name, created_at: null, updated_at: null }
              : {
                  id: `synthetic-${name}`,
                  name,
                  created_at: object.createdAt,
                  updated_at: object.updatedAt,
                  metadata: { size: object.body.length },
                },
          )
        }
        return json(
          response,
          200,
          [...entries.values()]
            .sort((left, right) => String(left.name).localeCompare(String(right.name)))
            .slice(offset, offset + limit),
        )
      }
      if (url.pathname === '/storage/v1/object/images' && request.method === 'DELETE') {
        const body = await readJson(request)
        const prefixes = Array.isArray(body.prefixes)
          ? body.prefixes.filter((value): value is string => typeof value === 'string')
          : []
        for (const key of prefixes) objects.delete(key)
        return json(
          response,
          200,
          prefixes.map((name) => ({ name })),
        )
      }
      const authPrefix = '/auth/v1/admin/users/'
      if (url.pathname.startsWith(authPrefix) && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.slice(authPrefix.length))
        if (!(await canDeleteAuthUser(id))) {
          return json(response, 409, { message: 'Synthetic deletion order rejected' })
        }
        if (!authUsers.delete(id)) return json(response, 404, { message: 'User not found' })
        return json(response, 200, {})
      }
      return json(response, 404, { message: 'Synthetic route not found' })
    })().catch(() => json(response, 500, { message: 'Synthetic fixture failed' }))
  })
}

describe.skipIf(!qaEnabled)(
  'ISSUE-136 physical purge through the internal API and provider HTTP contracts',
  () => {
    let prisma: PrismaClient
    let purgeGet: typeof import('@/app/internal/account-deletion-purges/route').GET
    let server: ReturnType<typeof providerFixture>
    const objects = new Map<string, StoredObject>()
    const authUsers = new Set<string>()
    const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    const originalKey = `uploads/${userHash}/202001/${imageId}.jpg`
    const thumbnailKey = originalKey.replace(/\.jpg$/, '_thumb.webp')
    const previewKey = originalKey.replace(/\.jpg$/, '_preview.webp')
    const orphanKey = `uploads/${userHash}/202001/00000000-0000-4000-8000-000000000142.jpg`
    const legacyKey = `uploads/${userHash}/legacy/tmp-object.bin`
    const otherUserHash = createHash('sha256').update(otherUserId).digest('hex').slice(0, 16)
    const otherOriginalKey = `uploads/${otherUserHash}/202001/${otherImageId}.jpg`
    const originalEnvironment = {
      cronSecret: process.env.CRON_SECRET,
      apply: process.env.ACCOUNT_PHYSICAL_PURGE_APPLY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    beforeAll(async () => {
      const environment = assertIssue136PurgeQaEnvironment(process.env)
      const url = new URL(environment.providerUrl)
      server = providerFixture(objects, authUsers, async (id) => {
        if (!prisma) return false
        const ownedPrefix = `uploads/${createHash('sha256').update(id).digest('hex').slice(0, 16)}/`
        if ([...objects.keys()].some((key) => key.startsWith(ownedPrefix))) return false
        if (id === otherUserId) return true
        const generation = await prisma.aiGeneration.findUnique({ where: { id: generationId } })
        return (
          id === userId &&
          generation?.userId === null &&
          generation.childId === null &&
          generation.anonymizedAt !== null
        )
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(Number(url.port), url.hostname, resolve)
      })

      process.env.CRON_SECRET = cronSecret
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
      ;({ prisma } = await import('@/server/db/prisma'))
      ;({ GET: purgeGet } = await import('@/app/internal/account-deletion-purges/route'))

      const old = new Date(fixtureTimestamp)
      const recent = new Date()
      await prisma.accountDeletionRequest.deleteMany({
        where: { userId: { in: [userId, otherUserId] } },
      })
      await prisma.aiGeneration.deleteMany({ where: { id: generationId } })
      await prisma.profile.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
      await prisma.profile.create({
        data: {
          id: userId,
          deletionRequestedAt: old,
          accessBlockedAt: old,
          purgeAfter: old,
        },
      })
      await prisma.profile.create({
        data: {
          id: otherUserId,
          deletionRequestedAt: recent,
          accessBlockedAt: recent,
          purgeAfter: old,
        },
      })
      await prisma.child.create({
        data: {
          id: childId,
          userId,
          name: 'Synthetic QA',
          birthdate: new Date('2020-01-01T00:00:00.000Z'),
          deletedAt: old,
        },
      })
      await prisma.memory.create({
        data: {
          id: memoryId,
          userId,
          childId,
          title: 'Synthetic QA',
          recordedAt: old,
          deletedAt: old,
        },
      })
      await prisma.image.create({
        data: {
          id: imageId,
          userId,
          memoryId,
          storageKey: originalKey,
          contentType: 'image/jpeg',
          width: 1,
          height: 1,
          fileSize: 4,
          metadataSanitizedAt: old,
          originalVariantStatus: 'ready',
          thumbnailVariantStatus: 'ready',
          previewVariantStatus: 'ready',
          variantRepairStatus: 'complete',
          deletedAt: old,
        },
      })
      await prisma.image.create({
        data: {
          id: otherImageId,
          userId: otherUserId,
          storageKey: otherOriginalKey,
          contentType: 'image/jpeg',
          width: 1,
          height: 1,
          fileSize: 4,
          metadataSanitizedAt: old,
          originalVariantStatus: 'ready',
          thumbnailVariantStatus: 'pending',
          previewVariantStatus: 'pending',
          variantRepairStatus: 'pending',
        },
      })
      await prisma.aiGeneration.create({
        data: {
          id: generationId,
          userId,
          childId,
          model: 'synthetic-model',
          promptVersion: 'qa',
          status: 'succeeded',
          succeeded: true,
        },
      })
      await prisma.accountDeletionRequest.create({
        data: {
          id: requestId,
          userId,
          idempotencyKey: '00000000-0000-4000-8000-000000000143',
          receiptHash: '0'.repeat(64),
          requestedAt: old,
          accessBlockedAt: old,
          purgeAfter: old,
          authRevocationStatus: 'succeeded',
          authRevokedAt: old,
          nextAuthAttemptAt: old,
          nextPurgeAttemptAt: old,
        },
      })
      await prisma.accountDeletionRequest.create({
        data: {
          id: otherRequestId,
          userId: otherUserId,
          idempotencyKey: '00000000-0000-4000-8000-000000000153',
          receiptHash: '1'.repeat(64),
          requestedAt: recent,
          accessBlockedAt: recent,
          purgeAfter: old,
          authRevocationStatus: 'succeeded',
          authRevokedAt: recent,
          nextAuthAttemptAt: recent,
          nextPurgeAttemptAt: old,
        },
      })
      for (const key of [
        originalKey,
        thumbnailKey,
        previewKey,
        orphanKey,
        legacyKey,
        otherOriginalKey,
      ]) {
        objects.set(key, {
          body: Buffer.from('test'),
          createdAt: fixtureTimestamp,
          updatedAt: fixtureTimestamp,
        })
      }
      authUsers.add(userId)
      authUsers.add(otherUserId)
    })

    afterAll(async () => {
      if (prisma) {
        await prisma.accountDeletionRequest.deleteMany({
          where: { userId: { in: [userId, otherUserId] } },
        })
        await prisma.aiGeneration.deleteMany({ where: { id: generationId } })
        await prisma.profile.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
        await prisma.$disconnect()
      }
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
      if (originalEnvironment.cronSecret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = originalEnvironment.cronSecret
      if (originalEnvironment.apply === undefined) delete process.env.ACCOUNT_PHYSICAL_PURGE_APPLY
      else process.env.ACCOUNT_PHYSICAL_PURGE_APPLY = originalEnvironment.apply
      if (originalEnvironment.serviceRoleKey === undefined)
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnvironment.serviceRoleKey
    })

    async function runPurge(apply: boolean) {
      if (apply) process.env.ACCOUNT_PHYSICAL_PURGE_APPLY = 'confirmed'
      else delete process.env.ACCOUNT_PHYSICAL_PURGE_APPLY
      const response = await purgeGet(
        new Request('http://localhost/internal/account-deletion-purges', {
          headers: { authorization: `Bearer ${cronSecret}` },
        }),
      )
      expect(response.status).toBe(200)
      return (await response.json()) as Record<string, unknown>
    }

    it('defaults to dry-run, purges Storage then Auth then DB, and becomes idempotent', async () => {
      const dryRun = await runPurge(false)
      expect(dryRun).toEqual({
        eligibleAccounts: 1,
        leasedAccounts: 0,
        imageRows: 1,
        dbExpectedObjects: 3,
        listedStorageObjects: 5,
        storageListingFailures: 0,
        failedAccounts: 0,
      })
      expect(objects.size).toBe(6)
      expect(authUsers.has(userId)).toBe(true)
      expect(authUsers.has(otherUserId)).toBe(true)
      expect(await prisma.profile.count({ where: { id: userId } })).toBe(1)
      expect(await prisma.profile.count({ where: { id: otherUserId } })).toBe(1)
      expect(
        await prisma.accountDeletionRequest.findUnique({ where: { id: otherRequestId } }),
      ).toMatchObject({ purgeStatus: 'pending', purgeAttempts: 0 })

      const applied = await runPurge(true)
      expect(applied).toEqual({ claimed: 1, purged: 1, failed: 0 })
      expect(objects.size).toBe(1)
      expect(objects.has(otherOriginalKey)).toBe(true)
      expect(authUsers.has(userId)).toBe(false)
      expect(authUsers.has(otherUserId)).toBe(true)
      expect(await prisma.profile.count({ where: { id: userId } })).toBe(0)
      expect(await prisma.profile.count({ where: { id: otherUserId } })).toBe(1)
      expect(await prisma.image.count({ where: { id: otherImageId } })).toBe(1)
      expect(
        await prisma.accountDeletionRequest.findUnique({ where: { id: otherRequestId } }),
      ).toMatchObject({ purgeStatus: 'pending', purgeAttempts: 0 })
      expect(await prisma.child.count({ where: { id: childId } })).toBe(0)
      expect(await prisma.memory.count({ where: { id: memoryId } })).toBe(0)
      expect(await prisma.image.count({ where: { id: imageId } })).toBe(0)
      expect(await prisma.accountDeletionRequest.count({ where: { id: requestId } })).toBe(0)
      expect(await prisma.aiGeneration.findUnique({ where: { id: generationId } })).toMatchObject({
        userId: null,
        childId: null,
        anonymizedAt: expect.any(Date),
      })

      const repeated = await runPurge(true)
      expect(repeated).toEqual({ claimed: 0, purged: 0, failed: 0 })
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain(userId)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain(otherUserId)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain('uploads/')
    })
  },
)
