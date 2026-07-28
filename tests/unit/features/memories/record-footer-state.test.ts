import { describe, expect, it } from 'vitest'
import { getRecordFooterState } from '@/features/memories/client/record-footer-state'

const base = {
  hasSelectedPhoto: false,
  uploaded: false,
  uploadStatus: 'idle' as const,
  uploadFailureStage: null,
  aiStatus: 'idle' as const,
  aiTimedOut: false,
  aiQuotaExceeded: false,
  hasTitle: false,
  canSubmit: false,
  submitting: false,
}

describe('getRecordFooterState', () => {
  it('starts with photo selection as the primary action', () => {
    expect(getRecordFooterState(base)).toMatchObject({
      primaryAction: 'choose-photo',
      primaryLabel: 'しゃしんを えらぶ',
      primaryDisabled: false,
    })
  })

  it.each([
    ['preparing', '写真を準備しています…'],
    ['uploading', '写真を送っています…'],
    ['confirming', '写真の保存を確認しています…'],
  ] as const)('disables repeated actions while upload is %s', (uploadStatus, primaryLabel) => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploadStatus,
      }),
    ).toMatchObject({
      primaryAction: 'uploading',
      primaryLabel,
      primaryDisabled: true,
    })
  })

  it.each([
    ['prepare', '同じ写真で もういちど'],
    ['put', '同じ写真を もういちど送る'],
    ['confirm', '保存の確認を もういちど'],
  ] as const)('retries from the failed %s stage without requiring reselection', (stage, label) => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploadStatus: 'failed',
        uploadFailureStage: stage,
      }),
    ).toMatchObject({
      primaryAction: 'retry-upload',
      primaryLabel: label,
      primaryDisabled: false,
      secondaryAction: 'choose-photo',
    })
  })

  it('promotes AI generation and keeps manual writing adjacent after upload', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
      }),
    ).toMatchObject({
      primaryAction: 'generate-ai',
      primaryLabel: 'AI で 下書きする',
      secondaryAction: 'manual',
    })
  })

  it('disables the footer while AI is generating', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'generating',
      }),
    ).toMatchObject({
      primaryAction: 'generating-ai',
      primaryDisabled: true,
    })
  })

  it('offers AI retry and manual writing after a recoverable AI failure', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'failed',
      }),
    ).toMatchObject({
      primaryAction: 'retry-ai',
      secondaryAction: 'manual',
    })
  })

  it('offers retry and manual writing after timeout even when existing input remains', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'failed',
        aiTimedOut: true,
        hasTitle: true,
        canSubmit: true,
      }),
    ).toMatchObject({
      primaryAction: 'retry-ai',
      secondaryAction: 'manual',
      statusLabel: 'AIの待機を終えました。再試行するか、手動入力で続けられます',
    })
  })

  it('uses manual writing as primary when AI quota prevents retry', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'failed',
        aiQuotaExceeded: true,
      }),
    ).toMatchObject({
      primaryAction: 'manual',
      secondaryAction: null,
    })
  })

  it('promotes save only after a title makes the record ready', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'done',
        hasTitle: true,
        canSubmit: true,
      }),
    ).toMatchObject({
      primaryAction: 'save',
      primaryLabel: 'このまま 残す',
      primaryDisabled: false,
      secondaryAction: 'retry-ai',
    })
  })

  it('locks the primary action during save', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        hasTitle: true,
        submitting: true,
      }),
    ).toMatchObject({
      primaryAction: 'saving',
      primaryDisabled: true,
    })
  })

  it('keeps AI generation ahead of save when an existing title is present', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'generating',
        hasTitle: true,
        canSubmit: true,
      }),
    ).toMatchObject({
      primaryAction: 'generating-ai',
      primaryDisabled: true,
    })
  })

  it('offers save and AI retry when regeneration fails with an existing title', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'failed',
        hasTitle: true,
        canSubmit: true,
      }),
    ).toMatchObject({
      primaryAction: 'save',
      primaryLabel: '現在の内容を 残す',
      secondaryAction: 'retry-ai',
    })
  })

  it('keeps manual writing primary after quota exhaustion even after photo replacement', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiQuotaExceeded: true,
      }),
    ).toMatchObject({
      primaryAction: 'manual',
      primaryDisabled: false,
    })
  })

  it('does not announce AI retry after quota exhaustion when existing content can be saved', () => {
    expect(
      getRecordFooterState({
        ...base,
        hasSelectedPhoto: true,
        uploaded: true,
        uploadStatus: 'done',
        aiStatus: 'failed',
        aiQuotaExceeded: true,
        hasTitle: true,
        canSubmit: true,
      }),
    ).toMatchObject({
      primaryAction: 'save',
      secondaryAction: null,
      statusLabel: '現在の内容を保存できます。AIの上限に達したため再試行はできません',
    })
  })
})
