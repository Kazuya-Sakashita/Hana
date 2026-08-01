import 'server-only'

import { ApiProblemError, type ProblemDetails } from '@/lib/api/error'

// Route Handler で throw する ApiProblemError を組み立てる共通ビルダー。
// reason は snake_case の安定 ID。type URI は kebab-case 自動変換。

type FieldError = NonNullable<ProblemDetails['errors']>[number]

function build(
  reason: string,
  title: string,
  status: number,
  detail: string,
  errors?: FieldError[],
): ApiProblemError {
  const problem: ProblemDetails = {
    type: `https://hana.app/problems/${reason.replace(/_/g, '-')}`,
    title,
    status,
    reason,
    detail,
    ...(errors ? { errors } : {}),
  }
  return new ApiProblemError(problem)
}

export const problems = {
  unauthorized: () => build('unauthorized', 'Unauthorized', 401, 'サインインが必要です'),
  forbidden: () => build('forbidden', 'Forbidden', 403, 'このリソースへのアクセス権がありません'),
  notFound: (detail = 'リソースが見つかりません') => build('not_found', 'Not Found', 404, detail),
  validation: (errors: FieldError[]) =>
    build('validation_error', 'Validation Error', 422, '入力内容に誤りがあります', errors),
  childLimitReached: () =>
    build(
      'child_limit_reached',
      'Conflict',
      409,
      '現在のプランでは子どもプロフィールは 1 件までです',
    ),
  productEventConflict: () =>
    build('product_event_conflict', 'Conflict', 409, '同じイベントIDの内容が一致しません'),
  memoryIdempotencyConflict: () =>
    build('memory_idempotency_conflict', 'Conflict', 409, '同じ保存操作の内容が一致しません'),
  memoryUpdateConflict: () =>
    build(
      'memory_update_conflict',
      'Conflict',
      409,
      '別の画面で記録が更新されました。最新の内容を確認してください',
    ),
  imageSanitizationPending: () =>
    build('image_sanitization_pending', 'Conflict', 409, '原画像の安全確認を処理中です'),
  imageAlreadyLinked: () =>
    build('image_already_linked', 'Conflict', 409, 'この画像は記録に保存されています'),
  aiConsentRequired: () =>
    build('ai_consent_required', 'Forbidden', 403, 'AI への画像送信に同意が必要です'),
  aiConsentUpdateBusy: () =>
    build(
      'ai_consent_update_busy',
      'Conflict',
      409,
      'AI の処理が完了してから、もう一度お試しください',
    ),
  aiQuotaExceeded: () =>
    build('ai_quota_exceeded', 'Too Many Requests', 429, '今月の AI 生成回数の上限に達しました'),
  rateLimited: () =>
    build(
      'rate_limited',
      'Too Many Requests',
      429,
      '短時間に送信が続いています。少し時間をおいてからお試しください',
    ),
  storageUnavailable: () =>
    build(
      'storage_unavailable',
      'Service Unavailable',
      503,
      '画像の確認処理を一時的に利用できません',
    ),
  signOutFailed: () =>
    build(
      'sign_out_failed',
      'Service Unavailable',
      503,
      'サインアウトを完了できませんでした。もう一度お試しください',
    ),
  authProviderUnavailable: () =>
    build(
      'auth_provider_unavailable',
      'Service Unavailable',
      503,
      '本人確認を開始できませんでした。少し時間をおいてお試しください',
    ),
  accountDeletionReauthenticationRequired: () =>
    build(
      'account_deletion_reauthentication_required',
      'Forbidden',
      403,
      '退会前にGoogleで本人確認を行ってください',
    ),
  accountDeletionAlreadyProcessing: () =>
    build('account_deletion_already_processing', 'Conflict', 409, '退会の受付状態を確認しています'),
  aiGenerationFailed: () =>
    build(
      'ai_generation_failed',
      'Internal Server Error',
      500,
      '生成に失敗しました。もういちど ためしてみてください',
    ),
  aiOutputRejected: () =>
    build(
      'ai_output_rejected',
      'Unprocessable Entity',
      422,
      'AIの下書きを表示できませんでした。手動で入力するか、もう一度お試しください',
    ),
} as const

export type { FieldError }
