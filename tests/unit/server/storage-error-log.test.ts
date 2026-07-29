import { describe, expect, it, vi } from 'vitest'
import { logStorageError } from '@/features/uploads/server/storage-error-log'

describe('storage error log allowlist', () => {
  it('logs only a fixed message and stable reason', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logStorageError('storage_sign_failed')

    expect(spy).toHaveBeenCalledWith('createSignedUrl failed', {
      reason: 'storage_sign_failed',
    })
    spy.mockRestore()
  })
})
