import { describe, expect, it } from 'vitest'
import { assertIssue141StorageQaEnvironment } from '../../support/issue-141-storage-environment'

const safeEnvironment = {
  ISSUE_141_STORAGE_QA: '1',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55441/hana_ci',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:55441/hana_ci',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55442',
}

describe('ISSUE-141 synthetic Storage QA environment', () => {
  it('requires an explicit opt-in before accepting a target', () => {
    expect(() =>
      assertIssue141StorageQaEnvironment({ ...safeEnvironment, ISSUE_141_STORAGE_QA: undefined }),
    ).toThrow('issue_141_storage_qa_opt_in_required')
  })

  it.each([
    [
      'a remote database',
      { DATABASE_URL: 'postgresql://postgres:postgres@db.example.com:5432/hana_ci' },
      'database_url_loopback_required',
    ],
    [
      'a database other than hana_ci',
      { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55441/hana' },
      'database_url_hana_ci_required',
    ],
    [
      'a different direct database target',
      { DIRECT_URL: 'postgresql://postgres:postgres@localhost:55441/hana_ci' },
      'database_urls_must_match',
    ],
    [
      'a remote Storage endpoint',
      { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
      'supabase_url_loopback_required',
    ],
  ])('rejects %s', (_label, override, reason) => {
    expect(() => assertIssue141StorageQaEnvironment({ ...safeEnvironment, ...override })).toThrow(
      reason,
    )
  })

  it('accepts the dedicated local database and local Storage fixture', () => {
    expect(assertIssue141StorageQaEnvironment(safeEnvironment)).toEqual({
      databaseUrl: safeEnvironment.DATABASE_URL,
      directUrl: safeEnvironment.DIRECT_URL,
      storageUrl: 'http://127.0.0.1:55442/',
    })
  })
})
