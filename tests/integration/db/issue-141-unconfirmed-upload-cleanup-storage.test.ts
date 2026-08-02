import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { assertIssue141StorageQaEnvironment } from '../../support/issue-141-storage-environment'

const qaEnabled = process.env.ISSUE_141_STORAGE_QA === '1'
const serviceRoleKey = 'synthetic-service-role-key'
const cronSecret = 'synthetic-cron-secret'
const fixtureTimestamp = '2020-01-01T00:00:00.000Z'
const userId = '00000000-0000-4000-8000-000000000142'
const unconfirmedId = '00000000-0000-4000-8000-000000000143'
const confirmedId = '00000000-0000-4000-8000-000000000144'
const reservationId = '00000000-0000-4000-8000-000000000145'

interface StoredObject {
  body: Buffer
  createdAt: string
  updatedAt: string
}

function variants(key: string): string[] {
  const base = key.slice(0, key.lastIndexOf('.'))
  return [key, `${base}_thumb.webp`, `${base}_preview.webp`]
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

function storageFixture(objects: Map<string, StoredObject>) {
  return createServer((request, response) => {
    void (async () => {
      if (request.headers.authorization !== `Bearer ${serviceRoleKey}`) {
        return json(response, 401, { message: 'Synthetic fixture rejected' })
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/storage/v1/object/list/images' && request.method === 'POST') {
        const body = await readJson(request)
        const prefix = typeof body.prefix === 'string' ? body.prefix.replace(/\/$/, '') : ''
        const search = typeof body.search === 'string' ? body.search : null
        const offset = typeof body.offset === 'number' ? body.offset : 0
        const limit = typeof body.limit === 'number' ? body.limit : 100
        const entries = new Map<string, Record<string, unknown>>()
        for (const [key, object] of objects) {
          if (!key.startsWith(`${prefix}/`)) continue
          const remainder = key.slice(prefix.length + 1)
          const separator = remainder.indexOf('/')
          const name = separator === -1 ? remainder : remainder.slice(0, separator)
          const nested = separator !== -1
          if (search && !name.includes(search)) continue
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
        const listed = [...entries.values()]
          .sort((left, right) => String(left.name).localeCompare(String(right.name)))
          .slice(offset, offset + limit)
        return json(response, 200, listed)
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
      const objectPrefix = '/storage/v1/object/images/'
      if (url.pathname.startsWith(objectPrefix) && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.slice(objectPrefix.length))
        const object = objects.get(key)
        if (!object) return json(response, 404, { message: 'Synthetic object not found' })
        response.writeHead(200, { 'content-type': 'image/jpeg' })
        return response.end(object.body)
      }
      return json(response, 404, { message: 'Synthetic route not found' })
    })().catch(() => json(response, 500, { message: 'Synthetic fixture failed' }))
  })
}

describe.skipIf(!qaEnabled)(
  'ISSUE-141 unconfirmed upload cleanup through the internal API and Storage HTTP contract',
  () => {
    let prisma: PrismaClient
    let cleanupPost: typeof import('@/app/internal/unconfirmed-upload-cleanups/route').POST
    let storageUrl: string
    let server: ReturnType<typeof storageFixture>
    const objects = new Map<string, StoredObject>()
    const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    const unconfirmedKey = `uploads/${userHash}/202001/${unconfirmedId}.jpg`
    const confirmedKey = `uploads/${userHash}/202001/${confirmedId}.jpg`
    const unconfirmedKeys = variants(unconfirmedKey)
    const confirmedKeys = variants(confirmedKey)
    const originalEnvironment = {
      cronSecret: process.env.CRON_SECRET,
      apply: process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    beforeAll(async () => {
      const environment = assertIssue141StorageQaEnvironment(process.env)
      storageUrl = environment.storageUrl
      const url = new URL(storageUrl)
      server = storageFixture(objects)
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(Number(url.port), url.hostname, resolve)
      })

      process.env.CRON_SECRET = cronSecret
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
      ;({ prisma } = await import('@/server/db/prisma'))
      ;({ POST: cleanupPost } = await import('@/app/internal/unconfirmed-upload-cleanups/route'))

      const old = new Date(fixtureTimestamp)
      await prisma.profile.deleteMany({ where: { id: userId } })
      await prisma.profile.create({ data: { id: userId } })
      await prisma.uploadReservation.create({
        data: {
          id: reservationId,
          userId,
          storageKey: unconfirmedKey,
          issuedAt: old,
          signedUrlExpiresAt: old,
          cleanupAfter: old,
          nextAttemptAt: old,
        },
      })
      await prisma.image.create({
        data: {
          id: confirmedId,
          userId,
          storageKey: confirmedKey,
          contentType: 'image/jpeg',
          width: 1,
          height: 1,
          fileSize: 4,
        },
      })
      for (const key of [...unconfirmedKeys, ...confirmedKeys]) {
        objects.set(key, {
          body: Buffer.from('test'),
          createdAt: fixtureTimestamp,
          updatedAt: fixtureTimestamp,
        })
      }
    })

    afterAll(async () => {
      if (prisma) {
        await prisma.profile.deleteMany({ where: { id: userId } })
        await prisma.$disconnect()
      }
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
      if (originalEnvironment.cronSecret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = originalEnvironment.cronSecret
      if (originalEnvironment.apply === undefined)
        delete process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY
      else process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY = originalEnvironment.apply
      if (originalEnvironment.serviceRoleKey === undefined)
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnvironment.serviceRoleKey
    })

    async function runCleanup(apply: boolean) {
      if (apply) process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY = 'confirmed'
      else delete process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY
      const response = await cleanupPost(
        new Request('http://localhost/internal/unconfirmed-upload-cleanups', {
          method: 'POST',
          headers: { authorization: `Bearer ${cronSecret}` },
        }),
      )
      expect(response.status).toBe(200)
      return (await response.json()) as Record<string, unknown>
    }

    async function objectStatus(key: string) {
      return (
        await fetch(`${storageUrl}storage/v1/object/images/${encodeURIComponent(key)}`, {
          headers: { authorization: `Bearer ${serviceRoleKey}` },
        })
      ).status
    }

    it('dry-runs, deletes only the known unconfirmed variants, then becomes idempotent', async () => {
      const dryRun = await runCleanup(false)
      expect(dryRun).toMatchObject({ mode: 'dry-run', scanned: 1, eligible: 1, deleted: 0 })
      expect(await Promise.all(unconfirmedKeys.map(objectStatus))).toEqual([200, 200, 200])
      expect(await Promise.all(confirmedKeys.map(objectStatus))).toEqual([200, 200, 200])

      const applied = await runCleanup(true)
      expect(applied).toMatchObject({ mode: 'apply', scanned: 1, eligible: 1, deleted: 1 })
      expect(await Promise.all(unconfirmedKeys.map(objectStatus))).toEqual([404, 404, 404])
      expect(await Promise.all(confirmedKeys.map(objectStatus))).toEqual([200, 200, 200])

      const repeated = await runCleanup(true)
      expect(repeated).toMatchObject({ mode: 'apply', scanned: 0, deleted: 0 })

      const allowedMetrics = [
        'deleted',
        'eligible',
        'failed',
        'invalid',
        'legacyDiscovered',
        'legacyInvalid',
        'legacyListFailed',
        'legacyScanned',
        'mode',
        'protected',
        'retried',
        'scanned',
        'skippedRecent',
      ]
      expect(Object.keys(applied).sort()).toEqual(allowedMetrics)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain(userId)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain('uploads/')
    })
  },
)
