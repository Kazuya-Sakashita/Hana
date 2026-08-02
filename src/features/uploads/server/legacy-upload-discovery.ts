import type { PrismaClient } from '@prisma/client'
import { isValidStorageKey, storageKeyPrefixForUser } from '@/features/uploads/server/storage-key'
import {
  SIGNED_UPLOAD_TTL_MS,
  UNCONFIRMED_UPLOAD_RETENTION_MS,
} from '@/features/uploads/server/upload-reservation-policy'

interface ListedObject {
  name: string
  createdAt: string | null
  updatedAt: string | null
  isFolder: boolean
}

export interface LegacyDiscoveryStorage {
  list(path: string, offset: number): Promise<ListedObject[]>
}

export interface LegacyDiscoveryResult {
  legacyScanned: number
  legacyDiscovered: number
  legacyInvalid: number
  legacyListFailed: number
}

interface DiscoveryCursor {
  profileId: string | null
  monthOffset: number
  objectOffset: number
}

const PAGE_SIZE = 100
const MAX_DIRECTORY_STEPS = 10
const MONTH_PATTERN = /^\d{6}$/
const VARIANT_PATTERN = /^([0-9a-f-]{36})_(thumb|preview)\.webp$/
const CURSOR_ID = 'legacy-unconfirmed-upload-v2'
const EMPTY_CURSOR: DiscoveryCursor = { profileId: null, monthOffset: 0, objectOffset: 0 }

function parsedTimestamp(entry: ListedObject, now: Date): Date | null {
  if (!entry.createdAt || !entry.updatedAt) return null
  const createdAt = new Date(entry.createdAt)
  const updatedAt = new Date(entry.updatedAt)
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) return null
  const latest = createdAt > updatedAt ? createdAt : updatedAt
  return latest <= now ? latest : null
}

function originalCandidates(directory: string, name: string) {
  const direct = `${directory}/${name}`
  if (isValidStorageKey(direct)) {
    return { canonical: direct, kind: 'original', keys: [direct] }
  }
  const variant = VARIANT_PATTERN.exec(name)
  if (!variant) return null
  const base = `${directory}/${variant[1]}`
  return {
    canonical: `${base}.jpg`,
    kind: 'variant_only',
    keys: ['jpg', 'png', 'webp', 'heic'].map((extension) => `${base}.${extension}`),
  }
}

function parseCursor(value: string | null | undefined): DiscoveryCursor {
  if (!value) return { ...EMPTY_CURSOR }
  try {
    const parsed = JSON.parse(value) as Partial<DiscoveryCursor>
    if (
      (parsed.profileId === null || typeof parsed.profileId === 'string') &&
      Number.isSafeInteger(parsed.monthOffset) &&
      Number.isSafeInteger(parsed.objectOffset) &&
      (parsed.monthOffset ?? -1) >= 0 &&
      (parsed.objectOffset ?? -1) >= 0
    ) {
      return parsed as DiscoveryCursor
    }
  } catch {}
  return { ...EMPTY_CURSOR }
}

async function saveCursor(prisma: PrismaClient, cursor: DiscoveryCursor): Promise<void> {
  await prisma.maintenanceCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, cursorValue: JSON.stringify(cursor) },
    update: { cursorValue: JSON.stringify(cursor) },
  })
}

async function nextActiveProfile(prisma: PrismaClient, afterId: string | null) {
  return prisma.profile.findFirst({
    where: {
      accessBlockedAt: null,
      deletionRequestedAt: null,
      ...(afterId ? { id: { gt: afterId } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
}

export async function discoverLegacyUnconfirmedUploads(
  prisma: PrismaClient,
  storage: LegacyDiscoveryStorage,
  now = new Date(),
  persist = false,
): Promise<LegacyDiscoveryResult> {
  const result: LegacyDiscoveryResult = {
    legacyScanned: 0,
    legacyDiscovered: 0,
    legacyInvalid: 0,
    legacyListFailed: 0,
  }
  const storedCursor = persist
    ? await prisma.maintenanceCursor.findUnique({ where: { id: CURSOR_ID } })
    : null
  const cursor = parseCursor(storedCursor?.cursorValue)
  let profile = cursor.profileId
    ? await prisma.profile.findFirst({
        where: {
          id: cursor.profileId,
          accessBlockedAt: null,
          deletionRequestedAt: null,
        },
        select: { id: true },
      })
    : await nextActiveProfile(prisma, null)
  if (!profile && cursor.profileId) {
    profile = await nextActiveProfile(prisma, cursor.profileId)
    cursor.monthOffset = 0
    cursor.objectOffset = 0
  }
  const discoveryCutoff = new Date(now.getTime() - UNCONFIRMED_UPLOAD_RETENTION_MS)

  for (let step = 0; step < MAX_DIRECTORY_STEPS && profile; step += 1) {
    cursor.profileId = profile.id
    const prefix = storageKeyPrefixForUser(profile.id).slice(0, -1)
    let month: ListedObject | undefined
    try {
      month = (await storage.list(prefix, cursor.monthOffset))[0]
    } catch {
      result.legacyListFailed += 1
      profile = await nextActiveProfile(prisma, profile.id)
      cursor.profileId = profile?.id ?? null
      cursor.monthOffset = 0
      cursor.objectOffset = 0
      continue
    }
    if (!month) {
      profile = await nextActiveProfile(prisma, profile.id)
      cursor.profileId = profile?.id ?? null
      cursor.monthOffset = 0
      cursor.objectOffset = 0
      continue
    }
    if (!month.isFolder || !MONTH_PATTERN.test(month.name)) {
      result.legacyInvalid += 1
      cursor.monthOffset += 1
      cursor.objectOffset = 0
      continue
    }

    const directory = `${prefix}/${month.name}`
    let objects: ListedObject[]
    try {
      objects = await storage.list(directory, cursor.objectOffset)
    } catch {
      result.legacyListFailed += 1
      profile = await nextActiveProfile(prisma, profile.id)
      cursor.profileId = profile?.id ?? null
      cursor.monthOffset = 0
      cursor.objectOffset = 0
      continue
    }
    for (const object of objects) {
      if (object.isFolder) {
        result.legacyInvalid += 1
        continue
      }
      const group = originalCandidates(directory, object.name)
      if (!group) {
        result.legacyInvalid += 1
        continue
      }
      result.legacyScanned += 1
      const observedAt = parsedTimestamp(object, now)
      if (!observedAt || observedAt > discoveryCutoff) continue
      const [activeProfile, image, reservation] = await Promise.all([
        prisma.profile.findFirst({
          where: { id: profile.id, accessBlockedAt: null, deletionRequestedAt: null },
          select: { id: true },
        }),
        prisma.image.findFirst({ where: { storageKey: { in: group.keys } }, select: { id: true } }),
        prisma.uploadReservation.findFirst({
          where: { storageKey: { in: group.keys } },
          select: { id: true },
        }),
      ])
      if (!activeProfile || image || reservation) continue
      if (!persist) {
        result.legacyDiscovered += 1
        continue
      }
      const created = await prisma.uploadReservation.createMany({
        data: [
          {
            userId: profile.id,
            storageKey: group.canonical,
            candidateKind: group.kind,
            issuedAt: observedAt,
            signedUrlExpiresAt: new Date(observedAt.getTime() + SIGNED_UPLOAD_TTL_MS),
            cleanupAfter: new Date(now.getTime() + UNCONFIRMED_UPLOAD_RETENTION_MS),
            nextAttemptAt: new Date(now.getTime() + UNCONFIRMED_UPLOAD_RETENTION_MS),
          },
        ],
        skipDuplicates: true,
      })
      result.legacyDiscovered += created.count
    }

    if (objects.length === PAGE_SIZE) {
      cursor.objectOffset += PAGE_SIZE
      if (persist) await saveCursor(prisma, cursor)
      return result
    }
    cursor.monthOffset += 1
    cursor.objectOffset = 0
  }

  if (persist) await saveCursor(prisma, profile ? cursor : EMPTY_CURSOR)
  return result
}
