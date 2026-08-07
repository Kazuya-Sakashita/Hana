export interface ExistingImageCandidate {
  id: string
  storageKey: string
  contentType: string
}

export interface ExistingImageBackfillDependencies {
  listBatch(cursor: string | undefined): Promise<ExistingImageCandidate[]>
  sanitizeAndMark(image: ExistingImageCandidate): Promise<boolean>
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
        if (!(await dependencies.sanitizeAndMark(image))) {
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
