import { describe, expect, it, vi } from 'vitest'
import {
  runExistingImageBackfill,
  type ExistingImageCandidate,
} from '@/features/uploads/server/existing-image-backfill'

const first = { id: '1', storageKey: 'private-one', contentType: 'image/jpeg' }
const second = { id: '2', storageKey: 'private-two', contentType: 'image/jpeg' }
const state = { contentType: 'image/jpeg', width: 10, height: 20, fileSize: 100 }

function pagedList(pages: ExistingImageCandidate[][]) {
  let index = 0
  return vi.fn(async () => pages[index++] ?? [])
}

describe('runExistingImageBackfill', () => {
  it('counts every page without mutating in dry-run mode', async () => {
    const listBatch = pagedList([[first], [second], []])
    const sanitizeOriginal = vi.fn()
    const markSanitized = vi.fn()

    const result = await runExistingImageBackfill(false, {
      listBatch,
      sanitizeOriginal,
      markSanitized,
    })

    expect(result).toEqual({ mode: 'dry-run', eligible: 2, succeeded: 0, failed: 0 })
    expect(listBatch).toHaveBeenNthCalledWith(1, undefined)
    expect(listBatch).toHaveBeenNthCalledWith(2, first.id)
    expect(listBatch).toHaveBeenNthCalledWith(3, second.id)
    expect(sanitizeOriginal).not.toHaveBeenCalled()
    expect(markSanitized).not.toHaveBeenCalled()
  })

  it('continues after a partial failure and returns aggregate counts only', async () => {
    const sanitizeOriginal = vi
      .fn()
      .mockRejectedValueOnce(new Error('vendor detail private-one'))
      .mockResolvedValueOnce(state)
    const markSanitized = vi.fn().mockResolvedValue(true)

    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first, second], []]),
      sanitizeOriginal,
      markSanitized,
    })

    expect(result).toEqual({ mode: 'apply', eligible: 2, succeeded: 1, failed: 1 })
    expect(JSON.stringify(result)).not.toMatch(/private|storage|vendor/)
    expect(markSanitized).toHaveBeenCalledOnce()
    expect(markSanitized).toHaveBeenCalledWith(second.id, state)
  })

  it('reports a DB marker race as failed so a later run can repair it', async () => {
    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first], []]),
      sanitizeOriginal: vi.fn().mockResolvedValue(state),
      markSanitized: vi.fn().mockResolvedValue(false),
    })

    expect(result).toEqual({ mode: 'apply', eligible: 1, succeeded: 0, failed: 1 })
  })

  it('does not revisit successful rows returned by later cursor pages', async () => {
    const sanitizeOriginal = vi.fn().mockResolvedValue(state)
    const result = await runExistingImageBackfill(true, {
      listBatch: pagedList([[first], [second], []]),
      sanitizeOriginal,
      markSanitized: vi.fn().mockResolvedValue(true),
    })

    expect(result).toEqual({ mode: 'apply', eligible: 2, succeeded: 2, failed: 0 })
    expect(sanitizeOriginal).toHaveBeenCalledTimes(2)
  })
})
