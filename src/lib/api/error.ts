import type { components } from '@/lib/api/generated/schema'

export type ProblemDetails = components['schemas']['ProblemDetails']

export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export class ApiProblemError extends Error {
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
  }

  get reason(): string {
    return this.problem.reason
  }

  get status(): number {
    return this.problem.status
  }
}

export function isApiProblemError(value: unknown): value is ApiProblemError {
  return value instanceof ApiProblemError
}

export function isProblemReason<T extends string>(
  value: unknown,
  reason: T,
): value is ApiProblemError & { reason: T } {
  return isApiProblemError(value) && value.reason === reason
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.reason === 'string'
  )
}
