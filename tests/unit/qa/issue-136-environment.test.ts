import { describe, expect, it } from 'vitest'
import { assertIssue136PurgeQaEnvironment } from '../../support/issue-136-environment'

const safeEnvironment = {
  ISSUE_136_PURGE_QA: '1',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55443/hana_ci',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:55443/hana_ci',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55445',
}

describe('ISSUE-136 synthetic purge QA environment', () => {
  it('requires explicit purge QA opt-in', () => {
    expect(() =>
      assertIssue136PurgeQaEnvironment({
        ...safeEnvironment,
        ISSUE_136_PURGE_QA: undefined,
      }),
    ).toThrow('issue_136_purge_qa_opt_in_required')
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
    [
      'remote Supabase endpoint',
      { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
      'supabase_url_loopback_required',
    ],
    [
      'TLS endpoint instead of the local HTTP fixture',
      { NEXT_PUBLIC_SUPABASE_URL: 'https://127.0.0.1:55445' },
      'supabase_url_http_required',
    ],
  ])('rejects %s', (_label, override, reason) => {
    expect(() => assertIssue136PurgeQaEnvironment({ ...safeEnvironment, ...override })).toThrow(
      reason,
    )
  })

  it('accepts only the dedicated local database and loopback provider fixture', () => {
    expect(assertIssue136PurgeQaEnvironment(safeEnvironment)).toEqual({
      databaseUrl: safeEnvironment.DATABASE_URL,
      directUrl: safeEnvironment.DIRECT_URL,
      providerUrl: 'http://127.0.0.1:55445/',
    })
  })
})
