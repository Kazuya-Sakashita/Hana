import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import {
  generatePreviewVariant,
  generateThumbnailVariant,
} from '@/features/uploads/server/variants'
import { logStorageError } from '@/features/uploads/server/storage-error-log'

const BUCKET = 'images'

export interface VariantGenerationResult {
  thumbnail: 'ready' | 'missing'
  preview: 'ready' | 'missing'
}

export class VariantGenerationError extends Error {
  constructor(readonly reason: 'storage_unavailable' | 'variant_generation_failed') {
    super(reason)
  }
}

async function uploadVariant(
  storageKey: string,
  original: Buffer,
  size: 'thumbnail' | 'preview',
  options?: { signal?: AbortSignal; failOnError?: boolean },
): Promise<boolean> {
  let generated: { buffer: Buffer; contentType: 'image/webp' }
  try {
    generated =
      size === 'thumbnail'
        ? await generateThumbnailVariant(original)
        : await generatePreviewVariant(original)
  } catch {
    logStorageError('variant_generation_failed')
    if (options?.failOnError) throw new VariantGenerationError('variant_generation_failed')
    return false
  }

  try {
    const uploaded = await createSupabaseAdminClient({ signal: options?.signal })
      .storage.from(BUCKET)
      .upload(deriveVariantKey(storageKey, size), generated.buffer, {
        contentType: generated.contentType,
        upsert: true,
      })
    if (uploaded.error) {
      logStorageError(
        size === 'thumbnail' ? 'variant_thumbnail_upload_failed' : 'variant_preview_upload_failed',
      )
      if (options?.failOnError) throw new VariantGenerationError('storage_unavailable')
      return false
    }
    return true
  } catch (error) {
    if (error instanceof VariantGenerationError) throw error
    logStorageError(
      size === 'thumbnail' ? 'variant_thumbnail_upload_failed' : 'variant_preview_upload_failed',
    )
    if (options?.failOnError) throw new VariantGenerationError('storage_unavailable')
    return false
  }
}

export async function generateMissingVariants(
  storageKey: string,
  original: Buffer,
  requested: { thumbnail: boolean; preview: boolean } = { thumbnail: true, preview: true },
  options?: { signal?: AbortSignal; failOnError?: boolean },
): Promise<VariantGenerationResult> {
  const uploads = [
    requested.thumbnail ? uploadVariant(storageKey, original, 'thumbnail', options) : true,
    requested.preview ? uploadVariant(storageKey, original, 'preview', options) : true,
  ] as const
  if (options?.failOnError) {
    const settled = await Promise.allSettled(uploads)
    const thumbnail = settled[0]
    const preview = settled[1]
    if (thumbnail.status === 'rejected') throw thumbnail.reason
    if (preview.status === 'rejected') throw preview.reason
    return {
      thumbnail: thumbnail.value ? 'ready' : 'missing',
      preview: preview.value ? 'ready' : 'missing',
    }
  }

  const [thumbnail, preview] = await Promise.all(uploads)
  return {
    thumbnail: thumbnail ? 'ready' : 'missing',
    preview: preview ? 'ready' : 'missing',
  }
}
