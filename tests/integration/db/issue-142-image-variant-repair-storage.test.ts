import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { assertIssue142StorageQaEnvironment } from '../../support/issue-142-environment'

const qaEnabled = process.env.ISSUE_142_STORAGE_QA === '1'
const serviceRoleKey = 'synthetic-service-role-key'
const cronSecret = 'synthetic-cron-secret'
const userId = '00000000-0000-4000-8000-000000000152'
const imageId = '00000000-0000-4000-8000-000000000153'

interface StoredObject {
  body: Buffer
  contentType: string
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function storageFixture(objects: Map<string, StoredObject>) {
  return createServer((request, response) => {
    void (async () => {
      if (request.headers.authorization !== `Bearer ${serviceRoleKey}`) {
        return json(response, 401, { message: 'Synthetic fixture rejected' })
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const infoPrefix = '/storage/v1/object/info/images/'
      if (url.pathname.startsWith(infoPrefix) && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.slice(infoPrefix.length))
        const object = objects.get(key)
        if (!object) return json(response, 404, { message: 'Synthetic object not found' })
        return json(response, 200, {
          id: '00000000-0000-4000-8000-000000000154',
          name: key,
          bucket_id: 'images',
          created_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2020-01-01T00:00:00.000Z',
          size: object.body.length,
          content_type: object.contentType,
          cache_control: '300',
        })
      }

      const objectPrefix = '/storage/v1/object/images/'
      if (url.pathname.startsWith(objectPrefix)) {
        const key = decodeURIComponent(url.pathname.slice(objectPrefix.length))
        if (request.method === 'GET') {
          const object = objects.get(key)
          if (!object) return json(response, 404, { message: 'Synthetic object not found' })
          response.writeHead(200, {
            'content-length': object.body.length,
            'content-type': object.contentType,
          })
          return response.end(object.body)
        }
        if (request.method === 'POST' || request.method === 'PUT') {
          const stored = {
            body: await readBody(request),
            contentType: request.headers['content-type'] ?? 'application/octet-stream',
          }
          objects.set(key, stored)
          return json(response, 200, {
            Id: '00000000-0000-4000-8000-000000000154',
            Key: `images/${key}`,
          })
        }
      }
      return json(response, 404, { message: 'Synthetic route not found' })
    })().catch(() => json(response, 500, { message: 'Synthetic fixture failed' }))
  })
}

describe.skipIf(!qaEnabled)(
  'ISSUE-142 variant repair through the internal API and Storage HTTP contract',
  () => {
    let prisma: PrismaClient
    let repairPost: typeof import('@/app/internal/image-variant-repairs/route').POST
    let storageUrl: string
    let server: ReturnType<typeof storageFixture>
    const objects = new Map<string, StoredObject>()
    const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    const originalKey = `uploads/${userHash}/202001/${imageId}.jpg`
    const thumbnailKey = deriveVariantKey(originalKey, 'thumbnail')
    const previewKey = deriveVariantKey(originalKey, 'preview')
    let originalBody: Buffer
    const previewBody = Buffer.from('existing-preview')
    const originalEnvironment = {
      cronSecret: process.env.CRON_SECRET,
      apply: process.env.IMAGE_VARIANT_REPAIR_APPLY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    beforeAll(async () => {
      const environment = assertIssue142StorageQaEnvironment(process.env)
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
      ;({ POST: repairPost } = await import('@/app/internal/image-variant-repairs/route'))

      originalBody = await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#8f7f65' },
      })
        .jpeg()
        .toBuffer()
      objects.set(originalKey, { body: originalBody, contentType: 'image/jpeg' })
      objects.set(previewKey, { body: previewBody, contentType: 'image/webp' })

      await prisma.profile.deleteMany({ where: { id: userId } })
      await prisma.profile.create({ data: { id: userId } })
      await prisma.image.create({
        data: {
          id: imageId,
          userId,
          storageKey: originalKey,
          contentType: 'image/jpeg',
          width: 2,
          height: 2,
          fileSize: originalBody.length,
          metadataSanitizedAt: new Date('2020-01-01T00:00:00.000Z'),
          originalVariantStatus: 'ready',
          thumbnailVariantStatus: 'ready',
          previewVariantStatus: 'ready',
          variantRepairStatus: 'complete',
          variantRepairNextAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      })
    })

    afterAll(async () => {
      if (prisma) {
        await prisma.profile.deleteMany({ where: { id: userId } })
        await prisma.$disconnect()
      }
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
      if (originalEnvironment.cronSecret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = originalEnvironment.cronSecret
      if (originalEnvironment.apply === undefined) delete process.env.IMAGE_VARIANT_REPAIR_APPLY
      else process.env.IMAGE_VARIANT_REPAIR_APPLY = originalEnvironment.apply
      if (originalEnvironment.serviceRoleKey === undefined)
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnvironment.serviceRoleKey
    })

    async function runRepair(apply: boolean) {
      if (apply) process.env.IMAGE_VARIANT_REPAIR_APPLY = 'confirmed'
      else delete process.env.IMAGE_VARIANT_REPAIR_APPLY
      const response = await repairPost(
        new Request('http://localhost/internal/image-variant-repairs', {
          method: 'POST',
          headers: { authorization: `Bearer ${cronSecret}` },
        }),
      )
      expect(response.status).toBe(200)
      return (await response.json()) as Record<string, unknown>
    }

    async function storedObject(key: string) {
      const response = await fetch(
        `${storageUrl}storage/v1/object/images/${encodeURIComponent(key)}`,
        { headers: { authorization: `Bearer ${serviceRoleKey}` } },
      )
      return { status: response.status, body: Buffer.from(await response.arrayBuffer()) }
    }

    it('dry-runs, repairs only the missing thumbnail, then becomes idempotent', async () => {
      const dryRun = await runRepair(false)
      expect(dryRun).toMatchObject({
        mode: 'dry-run',
        eligibleTotal: 1,
        deadLetterTotal: 0,
        scanned: 1,
        repaired: 0,
      })
      expect((await storedObject(thumbnailKey)).status).toBe(404)

      const applied = await runRepair(true)
      expect(applied).toMatchObject({
        mode: 'apply',
        eligibleTotal: 1,
        deadLetterTotal: 0,
        scanned: 1,
        repaired: 1,
      })
      expect((await storedObject(thumbnailKey)).status).toBe(200)
      expect((await storedObject(originalKey)).body).toEqual(originalBody)
      expect((await storedObject(previewKey)).body).toEqual(previewBody)

      const repeated = await runRepair(true)
      expect(repeated).toMatchObject({
        mode: 'apply',
        eligibleTotal: 0,
        deadLetterTotal: 0,
        scanned: 0,
        repaired: 0,
      })

      const allowedMetrics = [
        'alreadyReady',
        'deadLetter',
        'deadLetterTotal',
        'eligibleTotal',
        'failed',
        'mode',
        'protected',
        'repaired',
        'retried',
        'scanned',
      ]
      expect(Object.keys(applied).sort()).toEqual(allowedMetrics)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain(userId)
      expect(JSON.stringify([dryRun, applied, repeated])).not.toContain('uploads/')
    })
  },
)
