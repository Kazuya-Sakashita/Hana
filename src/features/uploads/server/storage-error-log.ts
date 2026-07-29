import 'server-only'

const storageErrorMessages = {
  signed_upload_failed: 'createSignedUploadUrl failed',
  storage_sign_failed: 'createSignedUrl failed',
  storage_sign_fallback_failed: 'createSignedUrl failed (both variant and original)',
  variant_thumbnail_upload_failed: 'variant upload (thumbnail) failed',
  variant_preview_upload_failed: 'variant upload (preview) failed',
  variant_generation_failed: 'variant generation crashed',
} as const

export type StorageErrorReason = keyof typeof storageErrorMessages

export function logStorageError(reason: StorageErrorReason): void {
  console.error(storageErrorMessages[reason], { reason })
}
