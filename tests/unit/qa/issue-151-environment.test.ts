import { describe, expect, it } from 'vitest'
import { assertIssue151DatabaseQaEnvironment } from '../../support/issue-151-environment'

const safeEnvironment = {
  ISSUE_151_DATABASE_QA: '1',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55451/hana_ci',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:55451/hana_ci',
}

describe('ISSUE-151 database QA environment', () => {
  it('accepts one explicitly enabled loopback hana_ci database', () => {
    expect(assertIssue151DatabaseQaEnvironment(safeEnvironment)).toEqual({
      databaseUrl: safeEnvironment.DATABASE_URL,
      directUrl: safeEnvironment.DIRECT_URL,
    })
  })

  it.each([
    ['missing opt-in', { ...safeEnvironment, ISSUE_151_DATABASE_QA: '0' }],
    [
      'remote database',
      { ...safeEnvironment, DATABASE_URL: 'postgresql://test:test@db.example.com:5432/hana_ci' },
    ],
    [
      'non-synthetic database',
      { ...safeEnvironment, DATABASE_URL: 'postgresql://test:test@127.0.0.1:55451/hana' },
    ],
    [
      'different migration target',
      {
        ...safeEnvironment,
        DIRECT_URL: 'postgresql://postgres:postgres@localhost:55451/hana_ci',
      },
    ],
  ])('rejects %s', (_label, environment) => {
    expect(() => assertIssue151DatabaseQaEnvironment(environment)).toThrow()
  })
})
