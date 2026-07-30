'use client'

export async function signOutAndClear({
  clearQueryCache,
  clearImageCache,
  clearRecordDraft,
}: {
  clearQueryCache: () => void
  clearImageCache: () => void
  clearRecordDraft: () => void
}) {
  const response = await fetch('/sign-out', { method: 'POST' })
  if (!response.ok) throw new Error('sign_out_failed')

  clearQueryCache()
  clearImageCache()
  clearRecordDraft()
}
