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
  aiConsentRequired: () =>
    build('ai_consent_required', 'Forbidden', 403, 'AI への画像送信に同意が必要です'),
  aiQuotaExceeded: () =>
    build('ai_quota_exceeded', 'Too Many Requests', 429, '今月の AI 生成回数の上限に達しました'),
  aiGenerationFailed: () =>
    build(
      'ai_generation_failed',
      'Internal Server Error',
      500,
      '生成に失敗しました。もういちど ためしてみてください',
    ),
} as const

export type { FieldError }
