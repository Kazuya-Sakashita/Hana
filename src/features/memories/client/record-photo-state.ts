'use client'

import type { UploadFailureStage } from '@/features/memories/client/record-upload-retry'

export const RECORD_PHOTO_MAX = 5

export type RecordPhotoStatus =
  | 'selected'
  | 'preparing'
  | 'uploading'
  | 'confirming'
  | 'confirmed'
  | 'failed'

export interface RecordPhotoItem {
  clientId: string
  imageId: string | null
  status: RecordPhotoStatus
  failureStage: UploadFailureStage | null
  attempt: number
}

export interface RecordPhotoAggregate {
  count: number
  confirmedCount: number
  failedCount: number
  activeCount: number
  canAdd: boolean
  ready: boolean
}

export type AddRecordPhotoResult<T extends RecordPhotoItem = RecordPhotoItem> =
  | { kind: 'added'; photos: T[] }
  | { kind: 'full'; photos: T[] }
  | { kind: 'duplicate'; photos: T[] }

export function createRecordPhotoItem(clientId = globalThis.crypto.randomUUID()): RecordPhotoItem {
  return {
    clientId,
    imageId: null,
    status: 'selected',
    failureStage: null,
    attempt: 0,
  }
}

export function addRecordPhoto<T extends RecordPhotoItem>(
  photos: readonly T[],
  photo: T,
): AddRecordPhotoResult<T> {
  if (photos.some((current) => current.clientId === photo.clientId)) {
    return { kind: 'duplicate', photos: [...photos] }
  }
  if (photos.length >= RECORD_PHOTO_MAX) return { kind: 'full', photos: [...photos] }
  return { kind: 'added', photos: [...photos, photo] }
}

export function removeRecordPhoto<T extends RecordPhotoItem>(
  photos: readonly T[],
  clientId: string,
): T[] {
  return photos.filter((photo) => photo.clientId !== clientId)
}

export function moveRecordPhoto<T extends RecordPhotoItem>(
  photos: readonly T[],
  clientId: string,
  direction: 'up' | 'down',
): T[] {
  const from = photos.findIndex((photo) => photo.clientId === clientId)
  if (from < 0) return [...photos]
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= photos.length) return [...photos]
  const next = [...photos]
  ;[next[from], next[to]] = [next[to]!, next[from]!]
  return next
}

export function updateRecordPhoto<T extends RecordPhotoItem>(
  photos: readonly T[],
  clientId: string,
  update: (photo: T) => T,
): T[] {
  return photos.map((photo) => (photo.clientId === clientId ? update(photo) : photo))
}

export function beginRecordPhotoAttempt<T extends RecordPhotoItem>(photo: T): T {
  return {
    ...photo,
    imageId: null,
    status: 'preparing',
    failureStage: null,
    attempt: photo.attempt + 1,
  }
}

export function failRecordPhotoAttempt<T extends RecordPhotoItem>(
  photo: T,
  attempt: number,
  stage: UploadFailureStage,
): T {
  if (photo.attempt !== attempt || photo.status === 'confirmed') return photo
  return { ...photo, status: 'failed', failureStage: stage }
}

export function confirmRecordPhotoAttempt<T extends RecordPhotoItem>(
  photo: T,
  attempt: number,
  imageId: string,
): T {
  if (photo.attempt !== attempt || photo.status === 'confirmed') return photo
  return { ...photo, imageId, status: 'confirmed', failureStage: null }
}

export function getRecordPhotoAggregate(photos: readonly RecordPhotoItem[]): RecordPhotoAggregate {
  const confirmedCount = photos.filter((photo) => photo.status === 'confirmed').length
  const failedCount = photos.filter((photo) => photo.status === 'failed').length
  const activeCount = photos.filter((photo) =>
    ['preparing', 'uploading', 'confirming'].includes(photo.status),
  ).length
  return {
    count: photos.length,
    confirmedCount,
    failedCount,
    activeCount,
    canAdd: photos.length < RECORD_PHOTO_MAX,
    ready: photos.length > 0 && confirmedCount === photos.length,
  }
}

export function getOrderedConfirmedImageIds(photos: readonly RecordPhotoItem[]): string[] | null {
  if (!getRecordPhotoAggregate(photos).ready) return null
  const imageIds = photos.map((photo) => photo.imageId)
  if (imageIds.some((imageId) => imageId === null)) return null
  const confirmed = imageIds as string[]
  return new Set(confirmed).size === confirmed.length ? confirmed : null
}

export function createAsyncLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer')
  }
  let active = 0
  const queued: Array<() => void> = []

  const release = () => {
    active -= 1
    queued.shift()?.()
  }

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queued.push(resolve))
    }
    active += 1
    try {
      return await task()
    } finally {
      release()
    }
  }
}
