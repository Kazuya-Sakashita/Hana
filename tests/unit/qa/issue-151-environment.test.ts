import { describe, expect, it } from 'vitest'
import { assertIssue151DatabaseQaEnvironment } from '../../support/issue-151-environment'

const safeEnvironment = {
  ISSUE_151_DATABASE_QA: '1',
  DATABASE_URL: 'postgresql://hana_admin:hana-admin@127.0.0.1:55451/hana_ci',
  DIRECT_URL: 'postgresql://postgres:synthetic-schema-owner@127.0.0.1:55451/hana_ci',
  CHILD_DATABASE_URL: 'postgresql://hana_child_runtime:synthetic-runtime@127.0.0.1:55451/hana_ci',
}

describe('ISSUE-151 database QA environment', () => {
  it('accepts one explicitly enabled loopback hana_ci database', () => {
    expect(() => assertIssue151DatabaseQaEnvironment(safeEnvironment)).not.toThrow()
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
        DIRECT_URL: 'postgresql://postgres:synthetic-schema-owner@localhost:55451/hana_ci',
      },
    ],
    [
      'privileged child runtime',
      {
        ...safeEnvironment,
        CHILD_DATABASE_URL: 'postgresql://hana_admin:hana-admin@127.0.0.1:55451/hana_ci',
      },
    ],
    [
      'cluster admin used for migration',
      {
        ...safeEnvironment,
        DIRECT_URL: 'postgresql://hana_admin:hana-admin@127.0.0.1:55451/hana_ci',
      },
    ],
  ])('rejects %s', (_label, environment) => {
    expect(() => assertIssue151DatabaseQaEnvironment(environment)).toThrow()
  })
})
