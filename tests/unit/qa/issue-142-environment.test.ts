import { describe, expect, it } from 'vitest'
import {
  assertIssue142DatabaseQaEnvironment,
  assertIssue142StorageQaEnvironment,
} from '../../support/issue-142-environment'

const safeEnvironment = {
  ISSUE_142_DATABASE_QA: '1',
  ISSUE_142_STORAGE_QA: '1',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55443/hana_ci',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:55443/hana_ci',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55444',
}

describe('ISSUE-142 synthetic QA environment', () => {
  it('requires explicit database QA opt-in', () => {
    expect(() =>
      assertIssue142DatabaseQaEnvironment({
        ...safeEnvironment,
        ISSUE_142_DATABASE_QA: undefined,
      }),
    ).toThrow('issue_142_database_qa_opt_in_required')
  })

  it.each([
    [
      'remote database',
      { DATABASE_URL: 'postgresql://postgres:postgres@db.example.com:5432/hana_ci' },
      'database_url_loopback_required',
    ],
    [
      'non-QA database',
      { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55443/hana' },
      'database_url_hana_ci_required',
    ],
    [
      'different direct target',
      { DIRECT_URL: 'postgresql://postgres:postgres@localhost:55443/hana_ci' },
      'database_urls_must_match',
    ],
  ])('rejects %s', (_label, override, reason) => {
    expect(() => assertIssue142DatabaseQaEnvironment({ ...safeEnvironment, ...override })).toThrow(
      reason,
    )
  })

  it('requires separate Storage QA opt-in', () => {
    expect(() =>
      assertIssue142StorageQaEnvironment({
        ...safeEnvironment,
        ISSUE_142_STORAGE_QA: undefined,
      }),
    ).toThrow('issue_142_storage_qa_opt_in_required')
  })

  it('rejects a remote Storage endpoint', () => {
    expect(() =>
      assertIssue142StorageQaEnvironment({
        ...safeEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrow('supabase_url_loopback_required')
  })

  it('accepts only the dedicated local database and Storage fixture', () => {
    expect(assertIssue142StorageQaEnvironment(safeEnvironment)).toEqual({
      databaseUrl: safeEnvironment.DATABASE_URL,
      directUrl: safeEnvironment.DIRECT_URL,
      storageUrl: 'http://127.0.0.1:55444/',
    })
  })
})
