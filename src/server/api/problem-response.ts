import 'server-only'

import { ApiProblemError, isApiProblemError, type ProblemDetails } from '@/lib/api/error'

// Route Handler が throw した ApiProblemError (および予期しない Error) を
// application/problem+json レスポンスに変換する共通ヘルパ。

const INTERNAL_ERROR: ProblemDetails = {
  type: 'https://hana.app/problems/internal-server-error',
  title: 'Internal Server Error',
  status: 500,
  reason: 'internal_server_error',
  detail: 'サーバ内部で問題が発生しました',
}

export function problemResponse(problem: ProblemDetails): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export function toProblemResponse(error: unknown): Response {
  if (isApiProblemError(error)) {
    return problemResponse(error.problem)
  }
  return problemResponse(INTERNAL_ERROR)
}

export { ApiProblemError }
