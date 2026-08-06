import { describe, expect, it } from 'vitest'
// @ts-expect-error JavaScript CLI exports are exercised directly by Vitest.
import * as authContractModule from '../../../scripts/check-route-auth-contract.mjs'

const { collectMethodEvidence, runAuthContractCheck, validateAuthContract } = authContractModule

function privateOperation() {
  return {
    operationId: 'getPrivate',
    responses: {
      '200': { description: 'ok' },
      '401': { description: 'unauthorized' },
    },
  }
}

function fixture() {
  return {
    openapi: {
      security: [{ cookieSession: [] }],
      paths: {
        '/private': { get: privateOperation() },
        '/public': {
          get: {
            operationId: 'getPublic',
            security: [],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    },
    contract: {
      version: 1,
      private_security_scheme: 'cookieSession',
      operations: {
        'GET /private': {
          operation_id: 'getPrivate',
          source: 'src/app/v1/private/route.ts',
          access: 'private',
          guard: 'requireUser',
          ownership_strategy: 'session_user_filter',
          ownership_evidence: ['call:requireUser'],
          ownership_denials: [],
        },
        'GET /public': {
          operation_id: 'getPublic',
          source: 'src/app/v1/public/route.ts',
          access: 'public',
          guard: 'none',
          ownership_strategy: 'not_applicable',
          ownership_evidence: [],
          ownership_denials: [],
        },
      },
    },
  }
}

describe('route authentication contract', () => {
  it('accepts the repository OpenAPI, matrix, and Route Handlers', () => {
    const result = runAuthContractCheck({
      openapiPath: 'docs/openapi/openapi.yaml',
      contractPath: 'docs/api-driven-development/route-auth-contract.yaml',
    })

    expect(result.errors).toEqual([])
    expect(result.operationCount).toBe(24)
  })

  it('accepts the staged children ownership strategy', () => {
    const { openapi, contract } = fixture()
    const staged = {
      ...contract,
      operations: {
        ...contract.operations,
        'GET /private': {
          ...contract.operations['GET /private'],
          ownership_strategy: 'staged_owner_scope',
        },
      },
    }

    expect(validateAuthContract(openapi, staged).errors).toEqual([])
  })

  it('detects an operation missing from the matrix', () => {
    const { openapi, contract } = fixture()
    const contractWithMissingOperation = {
      ...contract,
      operations: { 'GET /private': contract.operations['GET /private'] },
    }

    expect(validateAuthContract(openapi, contractWithMissingOperation).errors).toContain(
      'GET /public: missing from route auth contract',
    )
  })

  it('rejects private operations without cookie security and a 401 response', () => {
    const { openapi, contract } = fixture()
    const openapiWithoutPrivateSecurity = {
      ...openapi,
      security: [],
      paths: {
        ...openapi.paths,
        '/private': {
          get: {
            ...openapi.paths['/private'].get,
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }

    const errors = validateAuthContract(openapiWithoutPrivateSecurity, contract).errors
    expect(errors).toContain('OpenAPI root security must require only cookieSession')
    expect(errors).toContain('GET /private: private operation must require only cookieSession')
    expect(errors).toContain('GET /private: private operation must declare 401')
  })

  it('never copies schema examples into drift output', () => {
    const { openapi, contract } = fixture()
    const openapiWithExample = {
      ...openapi,
      paths: {
        ...openapi.paths,
        '/private': {
          get: {
            ...openapi.paths['/private'].get,
            responses: {
              ...openapi.paths['/private'].get.responses,
              '200': { description: 'ok', example: 'synthetic-sensitive-body' },
            },
          },
        },
      },
    }
    const contractWithMissingOperation = {
      ...contract,
      operations: { 'GET /public': contract.operations['GET /public'] },
    }

    expect(
      validateAuthContract(openapiWithExample, contractWithMissingOperation).errors.join('\n'),
    ).not.toContain('synthetic-sensitive-body')
  })

  it('collects authentication evidence from each exported method separately', () => {
    const source = `
      export async function GET() { return new Response(null) }
      export async function POST() { await requireUser(); return new Response(null) }
    `

    expect(collectMethodEvidence(source, 'GET').has('call:requireUser')).toBe(false)
    expect(collectMethodEvidence(source, 'POST').has('call:requireUser')).toBe(true)
  })

  it('collects ownership evidence only from helpers reachable by the method', () => {
    const source = `
      async function loadOwned() { await childAccessStatus(); throw problems.forbidden() }
      async function unrelated() { await privilegedBypass() }
      export async function GET() { await loadOwned(); return new Response(null) }
      export async function POST() { await requireUser(); return new Response(null) }
    `

    const getEvidence = collectMethodEvidence(source, 'GET')
    expect(getEvidence.has('call:childAccessStatus')).toBe(true)
    expect(getEvidence.has('call:problems.forbidden')).toBe(true)
    expect(getEvidence.has('call:privilegedBypass')).toBe(false)
    expect(collectMethodEvidence(source, 'POST').has('call:childAccessStatus')).toBe(false)
  })

  it('accepts a documented 422 ownership denial only when it has evidence', () => {
    const { openapi, contract } = fixture()
    const openapiWith422 = {
      ...openapi,
      paths: {
        ...openapi.paths,
        '/private': {
          get: {
            ...openapi.paths['/private'].get,
            responses: {
              ...openapi.paths['/private'].get.responses,
              '422': { description: 'hidden ownership validation' },
            },
          },
        },
      },
    }
    const privateRecord = contract.operations['GET /private']
    const withEvidence = {
      ...contract,
      operations: {
        ...contract.operations,
        'GET /private': {
          ...privateRecord,
          ownership_denials: [
            {
              case: 'resource_not_visible_to_session',
              status: 422,
              evidence: ['call:problems.validation'],
            },
          ],
        },
      },
    }
    const withoutEvidence = {
      ...withEvidence,
      operations: {
        ...withEvidence.operations,
        'GET /private': {
          ...withEvidence.operations['GET /private'],
          ownership_denials: [
            { case: 'resource_not_visible_to_session', status: 422, evidence: [] },
          ],
        },
      },
    }

    expect(validateAuthContract(openapiWith422, withEvidence).errors).toEqual([])
    expect(validateAuthContract(openapiWith422, withoutEvidence).errors).toContain(
      'GET /private: ownership denial resource_not_visible_to_session requires evidence',
    )
  })
})
