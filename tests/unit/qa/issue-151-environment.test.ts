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
    [
      'DATABASE_URL host override',
      {
        ...safeEnvironment,
        DATABASE_URL: `${safeEnvironment.DATABASE_URL}?host=db.example.com`,
      },
    ],
    [
      'DATABASE_URL port override',
      { ...safeEnvironment, DATABASE_URL: `${safeEnvironment.DATABASE_URL}?port=6543` },
    ],
    [
      'DIRECT_URL host override',
      { ...safeEnvironment, DIRECT_URL: `${safeEnvironment.DIRECT_URL}?host=db.example.com` },
    ],
    [
      'DIRECT_URL port override',
      { ...safeEnvironment, DIRECT_URL: `${safeEnvironment.DIRECT_URL}?port=6543` },
    ],
    [
      'CHILD_DATABASE_URL host override',
      {
        ...safeEnvironment,
        CHILD_DATABASE_URL: `${safeEnvironment.CHILD_DATABASE_URL}?host=db.example.com`,
      },
    ],
    [
      'CHILD_DATABASE_URL port override',
      {
        ...safeEnvironment,
        CHILD_DATABASE_URL: `${safeEnvironment.CHILD_DATABASE_URL}?port=6543`,
      },
    ],
    [
      'socket target override',
      {
        ...safeEnvironment,
        DIRECT_URL: `${safeEnvironment.DIRECT_URL}?host=%2Fvar%2Frun%2Fpostgresql`,
      },
    ],
  ])('rejects %s', (_label, environment) => {
    expect(() => assertIssue151DatabaseQaEnvironment(environment)).toThrow()
  })
})
