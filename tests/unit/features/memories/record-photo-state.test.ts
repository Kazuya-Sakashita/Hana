import { describe, expect, it } from 'vitest'
import {
  addRecordPhoto,
  beginRecordPhotoAttempt,
  confirmRecordPhotoAttempt,
  createAsyncLimiter,
  createRecordPhotoItem,
  failRecordPhotoAttempt,
  getOrderedConfirmedImageIds,
  getRecordPhotoAggregate,
  moveRecordPhoto,
  removeRecordPhoto,
  updateRecordPhoto,
} from '@/features/memories/client/record-photo-state'

const IMAGE_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]

function selected(clientId: string) {
  return createRecordPhotoItem(clientId)
}

function confirmed(clientId: string, imageId: string) {
  return confirmRecordPhotoAttempt(beginRecordPhotoAttempt(selected(clientId)), 1, imageId)
}

describe('record photo state', () => {
  it('keeps stable client IDs and refuses a duplicate or sixth photo without changing order', () => {
    let photos = IMAGE_IDS.map((_, index) => selected(`client-${index + 1}`))
    const full = addRecordPhoto(photos, selected('client-6'))
    const duplicate = addRecordPhoto(photos, selected('client-1'))

    expect(full).toEqual({ kind: 'full', photos })
    expect(duplicate).toEqual({ kind: 'duplicate', photos })
    expect(photos.map((photo) => photo.clientId)).toEqual([
      'client-1',
      'client-2',
      'client-3',
      'client-4',
      'client-5',
    ])
  })

  it('moves up and down by client ID and leaves boundary moves unchanged', () => {
    const photos = [selected('a'), selected('b'), selected('c')]

    expect(moveRecordPhoto(photos, 'b', 'up').map((photo) => photo.clientId)).toEqual([
      'b',
      'a',
      'c',
    ])
    expect(moveRecordPhoto(photos, 'b', 'down').map((photo) => photo.clientId)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(moveRecordPhoto(photos, 'a', 'up')).toEqual(photos)
    expect(removeRecordPhoto(photos, 'b').map((photo) => photo.clientId)).toEqual(['a', 'c'])
  })

  it('requires every selected photo to be confirmed and returns IDs in display order', () => {
    const photos = [
      confirmed('third', IMAGE_IDS[2]!),
      confirmed('first', IMAGE_IDS[0]!),
      selected('pending'),
    ]

    expect(getRecordPhotoAggregate(photos)).toMatchObject({
      count: 3,
      confirmedCount: 2,
      ready: false,
    })
    expect(getOrderedConfirmedImageIds(photos)).toBeNull()

    const ready = updateRecordPhoto(photos, 'pending', (photo) =>
      confirmRecordPhotoAttempt(beginRecordPhotoAttempt(photo), 1, IMAGE_IDS[1]!),
    )
    expect(getOrderedConfirmedImageIds(ready)).toEqual([IMAGE_IDS[2], IMAGE_IDS[0], IMAGE_IDS[1]])
  })

  it('ignores stale failure and confirmation results from an older attempt', () => {
    const first = beginRecordPhotoAttempt(selected('client'))
    const second = beginRecordPhotoAttempt(first)

    expect(failRecordPhotoAttempt(second, first.attempt, 'put')).toBe(second)
    expect(confirmRecordPhotoAttempt(second, first.attempt, IMAGE_IDS[0]!)).toBe(second)
    expect(failRecordPhotoAttempt(second, second.attempt, 'confirm')).toMatchObject({
      status: 'failed',
      failureStage: 'confirm',
      attempt: 2,
    })
  })

  it('rejects duplicate confirmed server IDs from the exact ordered payload', () => {
    const photos = [confirmed('a', IMAGE_IDS[0]!), confirmed('b', IMAGE_IDS[0]!)]

    expect(getRecordPhotoAggregate(photos).ready).toBe(true)
    expect(getOrderedConfirmedImageIds(photos)).toBeNull()
  })
})

describe('bounded async limiter', () => {
  it('never exceeds concurrency and continues after a task rejects', async () => {
    const limit = createAsyncLimiter(2)
    let active = 0
    let maximum = 0
    const releases: Array<() => void> = []
    const task = (reject = false) =>
      limit(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise<void>((resolve) => releases.push(resolve))
        active -= 1
        if (reject) throw new Error('synthetic')
        return 'done'
      })

    const first = task()
    const second = task(true)
    const third = task()
    await Promise.resolve()
    expect(active).toBe(2)
    releases.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    releases.shift()?.()
    await expect(second).rejects.toThrow('synthetic')
    await Promise.resolve()
    releases.shift()?.()

    await expect(Promise.all([first, third])).resolves.toEqual(['done', 'done'])
    expect(maximum).toBe(2)
  })

  it('rejects an invalid concurrency', () => {
    expect(() => createAsyncLimiter(0)).toThrow(RangeError)
    expect(() => createAsyncLimiter(1.5)).toThrow(RangeError)
  })
})
