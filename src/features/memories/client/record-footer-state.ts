import {
  getUploadRetryCopy,
  type UploadFailureStage,
} from '@/features/memories/client/record-upload-retry'

export type RecordUploadStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'confirming'
  | 'done'
  | 'failed'

export type RecordAiStatus = 'idle' | 'consent_pending' | 'generating' | 'done' | 'failed'

export type RecordFooterPrimaryAction =
  | 'choose-photo'
  | 'uploading'
  | 'retry-upload'
  | 'generate-ai'
  | 'generating-ai'
  | 'retry-ai'
  | 'manual'
  | 'save'
  | 'saving'

export interface RecordFooterState {
  primaryAction: RecordFooterPrimaryAction
  primaryLabel: string
  primaryDisabled: boolean
  secondaryAction: 'manual' | 'retry-ai' | 'choose-photo' | null
  secondaryLabel: string | null
  statusLabel: string
}

export function getRecordFooterState({
  hasSelectedPhoto,
  uploaded,
  uploadStatus,
  uploadFailureStage,
  aiStatus,
  aiQuotaExceeded,
  hasTitle,
  canSubmit,
  submitting,
}: {
  hasSelectedPhoto: boolean
  uploaded: boolean
  uploadStatus: RecordUploadStatus
  uploadFailureStage: UploadFailureStage | null
  aiStatus: RecordAiStatus
  aiQuotaExceeded: boolean
  hasTitle: boolean
  canSubmit: boolean
  submitting: boolean
}): RecordFooterState {
  if (submitting) {
    return {
      primaryAction: 'saving',
      primaryLabel: 'しまっています…',
      primaryDisabled: true,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel: '記録を保存しています',
    }
  }

  if (!hasSelectedPhoto) {
    return {
      primaryAction: 'choose-photo',
      primaryLabel: 'しゃしんを えらぶ',
      primaryDisabled: false,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel: '最初に写真を1まい選びます',
    }
  }

  if (!uploaded) {
    if (uploadStatus === 'failed') {
      const retryCopy = getUploadRetryCopy(uploadFailureStage ?? 'prepare')
      return {
        primaryAction: 'retry-upload',
        primaryLabel: retryCopy.primaryLabel,
        primaryDisabled: false,
        secondaryAction: 'choose-photo',
        secondaryLabel: 'べつの写真を えらぶ',
        statusLabel: retryCopy.statusLabel,
      }
    }
    const statusLabel =
      uploadStatus === 'preparing'
        ? '写真を準備しています'
        : uploadStatus === 'confirming'
          ? '写真の保存を確認しています'
          : '写真を送っています'
    return {
      primaryAction: 'uploading',
      primaryLabel: `${statusLabel}…`,
      primaryDisabled: true,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel,
    }
  }

  if (aiStatus === 'generating') {
    return {
      primaryAction: 'generating-ai',
      primaryLabel: 'AI で 下書きしています…',
      primaryDisabled: true,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel: 'AIの下書きを待っています',
    }
  }

  if (aiStatus === 'consent_pending') {
    return {
      primaryAction: 'generating-ai',
      primaryLabel: 'AIの利用を 確認しています',
      primaryDisabled: true,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel: 'AIを使うか確認しています',
    }
  }

  if (aiStatus === 'failed') {
    if (hasTitle) {
      return {
        primaryAction: 'save',
        primaryLabel: '現在の内容を 残す',
        primaryDisabled: !canSubmit,
        secondaryAction: aiQuotaExceeded ? null : 'retry-ai',
        secondaryLabel: aiQuotaExceeded ? null : 'もういちど AI で 下書きする',
        statusLabel: aiQuotaExceeded
          ? '現在の内容を保存できます。AIの上限に達したため再試行はできません'
          : '現在の内容を保存するか、AIの下書きを再試行できます',
      }
    }
    if (aiQuotaExceeded) {
      return {
        primaryAction: 'manual',
        primaryLabel: 'AI を使わずに 書く',
        primaryDisabled: false,
        secondaryAction: null,
        secondaryLabel: null,
        statusLabel: '手動入力で記録を続けられます',
      }
    }
    return {
      primaryAction: 'retry-ai',
      primaryLabel: 'もういちど AI で 下書きする',
      primaryDisabled: false,
      secondaryAction: 'manual',
      secondaryLabel: 'AI を使わずに 書く',
      statusLabel: 'AIの下書きを作れませんでした',
    }
  }

  if (hasTitle) {
    const canRetryCompletedAi = aiStatus === 'done' && !aiQuotaExceeded
    return {
      primaryAction: 'save',
      primaryLabel: 'このまま 残す',
      primaryDisabled: !canSubmit,
      secondaryAction: canRetryCompletedAi ? 'retry-ai' : null,
      secondaryLabel: canRetryCompletedAi ? 'もういちど AI で 下書きする' : null,
      statusLabel: canSubmit
        ? canRetryCompletedAi
          ? 'この内容を保存するか、AIの下書きを作り直せます'
          : '保存できる状態です'
        : '日付とタイトルを確認してください',
    }
  }

  if (aiQuotaExceeded) {
    return {
      primaryAction: 'manual',
      primaryLabel: 'AI を使わずに 書く',
      primaryDisabled: false,
      secondaryAction: null,
      secondaryLabel: null,
      statusLabel: '手動入力で記録を続けられます',
    }
  }

  return {
    primaryAction: 'generate-ai',
    primaryLabel: aiStatus === 'done' ? 'もういちど AI で 下書きする' : 'AI で 下書きする',
    primaryDisabled: false,
    secondaryAction: 'manual',
    secondaryLabel: 'AI を使わずに 書く',
    statusLabel: 'AIの下書きか手動入力を選べます',
  }
}
