import { describe, expect, it } from 'vitest'
import {
  ApiProblemError,
  isApiProblemError,
  isProblemDetails,
  isProblemReason,
  type ProblemDetails,
} from '@/lib/api/error'

const sampleProblem: ProblemDetails = {
  type: 'https://hana.app/problems/validation-error',
  title: 'Validation Error',
  status: 422,
  reason: 'validation_error',
  detail: '入力内容に誤りがあります',
  instance: 'req_01',
}

describe('ApiProblemError', () => {
  it('exposes reason and status from the problem payload', () => {
    const err = new ApiProblemError(sampleProblem)
    expect(err.reason).toBe('validation_error')
    expect(err.status).toBe(422)
    expect(err.problem).toEqual(sampleProblem)
  })

  it('uses detail as the message when present, otherwise title', () => {
    expect(new ApiProblemError(sampleProblem).message).toBe('入力内容に誤りがあります')
    expect(new ApiProblemError({ ...sampleProblem, detail: undefined }).message).toBe(
      'Validation Error',
    )
  })
})

describe('isApiProblemError', () => {
  it('returns true only for ApiProblemError instances', () => {
    expect(isApiProblemError(new ApiProblemError(sampleProblem))).toBe(true)
    expect(isApiProblemError(new Error('boom'))).toBe(false)
    expect(isApiProblemError(sampleProblem)).toBe(false)
    expect(isApiProblemError(null)).toBe(false)
  })
})

describe('isProblemReason', () => {
  it('narrows on matching reason', () => {
    const err: unknown = new ApiProblemError(sampleProblem)
    expect(isProblemReason(err, 'validation_error')).toBe(true)
    expect(isProblemReason(err, 'token_expired')).toBe(false)
    expect(isProblemReason(new Error('boom'), 'validation_error')).toBe(false)
  })
})

describe('isProblemDetails', () => {
  it('accepts a structurally valid problem', () => {
    expect(isProblemDetails(sampleProblem)).toBe(true)
  })

  it('rejects shapes missing required fields', () => {
    expect(isProblemDetails({ ...sampleProblem, reason: undefined })).toBe(false)
    expect(isProblemDetails({ ...sampleProblem, status: '422' })).toBe(false)
    expect(isProblemDetails(null)).toBe(false)
    expect(isProblemDetails('not an object')).toBe(false)
  })
})
