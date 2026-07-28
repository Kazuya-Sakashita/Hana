export type UploadFailureStage = 'prepare' | 'put' | 'confirm'

export type UploadStageRunResult<TTarget, TResult> =
  | { kind: 'success'; target: TTarget; value: TResult }
  | { kind: 'failed'; stage: UploadFailureStage; target: TTarget | null }
  | { kind: 'stale' }

export function getUploadRetryStartStage(stage: UploadFailureStage): UploadFailureStage {
  return stage === 'confirm' ? 'confirm' : 'prepare'
}

export async function runUploadStages<TTarget, TResult>({
  startStage,
  target: initialTarget,
  isCurrent,
  onStageChange,
  prepare,
  put,
  confirm,
}: {
  startStage: UploadFailureStage
  target: TTarget | null
  isCurrent: () => boolean
  onStageChange: (stage: UploadFailureStage) => void
  prepare: () => Promise<TTarget>
  put: (target: TTarget) => Promise<void>
  confirm: (target: TTarget) => Promise<TResult>
}): Promise<UploadStageRunResult<TTarget, TResult>> {
  let target = initialTarget
  let stage = startStage

  if (!target && stage !== 'prepare') stage = 'prepare'

  if (stage === 'prepare') {
    onStageChange('prepare')
    try {
      target = await prepare()
    } catch {
      return isCurrent() ? { kind: 'failed', stage: 'prepare', target: null } : { kind: 'stale' }
    }
    if (!isCurrent()) return { kind: 'stale' }
  }

  if (!target) return { kind: 'failed', stage: 'prepare', target: null }

  if (stage !== 'confirm') {
    onStageChange('put')
    try {
      await put(target)
    } catch {
      return isCurrent() ? { kind: 'failed', stage: 'put', target } : { kind: 'stale' }
    }
    if (!isCurrent()) return { kind: 'stale' }
  }

  onStageChange('confirm')
  try {
    const value = await confirm(target)
    if (!isCurrent()) return { kind: 'stale' }
    return { kind: 'success', target, value }
  } catch {
    return isCurrent() ? { kind: 'failed', stage: 'confirm', target } : { kind: 'stale' }
  }
}

export function getUploadRetryCopy(stage: UploadFailureStage): {
  primaryLabel: string
  statusLabel: string
} {
  switch (stage) {
    case 'confirm':
      return {
        primaryLabel: '保存の確認を もういちど',
        statusLabel: '写真は届いています。保存の確認からやり直せます',
      }
    case 'put':
      return {
        primaryLabel: '同じ写真を もういちど送る',
        statusLabel: '写真を送りきれませんでした。同じ写真でやり直せます',
      }
    case 'prepare':
      return {
        primaryLabel: '同じ写真で もういちど',
        statusLabel: '写真を送る準備が途中でした。同じ写真でやり直せます',
      }
  }
}
