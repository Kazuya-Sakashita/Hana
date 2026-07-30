export interface ExistingImageCandidate {
  id: string
  storageKey: string
  contentType: string
}

export interface SanitizedImageState {
  contentType: string
  width: number
  height: number
  fileSize: number
}

export interface ExistingImageBackfillDependencies {
  listBatch(cursor: string | undefined): Promise<ExistingImageCandidate[]>
  sanitizeOriginal(image: ExistingImageCandidate): Promise<SanitizedImageState>
  markSanitized(id: string, state: SanitizedImageState): Promise<boolean>
}

export interface ExistingImageBackfillResult {
  mode: 'dry-run' | 'apply'
  eligible: number
  succeeded: number
  failed: number
}

export async function runExistingImageBackfill(
  apply: boolean,
  dependencies: ExistingImageBackfillDependencies,
): Promise<ExistingImageBackfillResult> {
  let cursor: string | undefined
  let eligible = 0
  let succeeded = 0
  let failed = 0

  while (true) {
    const images = await dependencies.listBatch(cursor)
    if (images.length === 0) break
    eligible += images.length
    cursor = images.at(-1)?.id

    if (!apply) continue
    for (const image of images) {
      try {
        const state = await dependencies.sanitizeOriginal(image)
        if (!(await dependencies.markSanitized(image.id, state))) {
          throw new Error('image_state_changed')
        }
        succeeded += 1
      } catch {
        failed += 1
      }
    }
  }

  return { mode: apply ? 'apply' : 'dry-run', eligible, succeeded, failed }
}
