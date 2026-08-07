import { describe, expect, it, vi } from 'vitest'
import {
  runExistingImageBackfill,
  type ExistingImageCandidate,
} from '@/features/uploads/server/existing-image-backfill'

const first = { id: '1', storageKey: 'private-one', contentType: 'image/jpeg' }
const second = { id: '2', storageKey: 'private-two', contentType: 'image/jpeg' }

function pagedList(pages: ExistingImageCandidate[][]) {
  let index = 0
  return vi.fn(async () => pages[index++] ?? [])
}

describe('runExistingImageBackfill', () => {
  it('counts every page without mutating in dry-run mode', async () => {
    const listBatch = pagedList([[first], [second], []])
    const sanitizeAndMark = vi.fn()

    const result = await runExistingImageBackfill(false, {
      listBatch,
      sanitizeAndMark,
    })

    expect(result).toEqual({ mode: 'dry-run', eligible: 2, succeeded: 0, failed: 0 })
    expect(listBatch).toHaveBeenNthCalledWith(1, undefined)
    expect(listBatch).toHaveBeenNthCalledWith(2, first.id)
    expect(listBatch).toHaveBeenNthCalledWith(3, second.id)
    expect(sanitizeAndMark).not.toHaveBeenCalled()
  })

  it('continues after a partial failure and returns aggregate counts only', async () => {
    const sanitizeAndMark = vi
      .fn()
      .mockRejectedValueOnce(new Error('vendor detail private-one'))
      .mockResolvedValueOnce(true)

    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first, second], []]),
      sanitizeAndMark,
    })

    expect(result).toEqual({ mode: 'apply', eligible: 2, succeeded: 1, failed: 1 })
    expect(JSON.stringify(result)).not.toMatch(/private|storage|vendor/)
    expect(sanitizeAndMark).toHaveBeenCalledTimes(2)
    expect(sanitizeAndMark).toHaveBeenNthCalledWith(2, second)
  })

  it('reports a DB marker race as failed so a later run can repair it', async () => {
    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first], []]),
      sanitizeAndMark: vi.fn().mockResolvedValue(false),
    })

    expect(result).toEqual({ mode: 'apply', eligible: 1, succeeded: 0, failed: 1 })
  })

  it('does not revisit successful rows returned by later cursor pages', async () => {
    const sanitizeAndMark = vi.fn().mockResolvedValue(true)
    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first], [second], []]),
      sanitizeAndMark,
    })

    expect(result).toEqual({ mode: 'apply', eligible: 2, succeeded: 2, failed: 0 })
    expect(sanitizeAndMark).toHaveBeenCalledTimes(2)
  })
})
