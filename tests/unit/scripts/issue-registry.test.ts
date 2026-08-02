import { describe, expect, it } from 'vitest'

import {
  findGithubStateMismatches,
  markClosedIssuesDone,
  parseGithubIssueStates,
  parseIssueDocument,
  renderIssueIndex,
  selectIssueFiles,
  validateUniqueFields,
  type IssueRecord,
} from '../../../scripts/issues/issue-registry'

const issueSource = (overrides = '') => `---
id: ISSUE-149
title: Issue registry test
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 319
${overrides}---

# Test
`

const record = (overrides: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'ISSUE-149',
  title: 'Issue registry test',
  priority: 'P1',
  status: 'todo',
  size: 'M',
  createdAt: '2026-08-03',
  githubIssue: 319,
  blockedBy: [],
  filePath: '/tmp/ISSUE-149-test.md',
  ...overrides,
})

describe('issue registry', () => {
  it('parses the allowed frontmatter schema', () => {
    expect(parseIssueDocument(issueSource(), '/tmp/ISSUE-149-test.md')).toMatchObject({
      id: 'ISSUE-149',
      status: 'todo',
      githubIssue: 319,
    })
  })

  it('rejects unsupported statuses and mismatched filenames', () => {
    expect(() =>
      parseIssueDocument(
        issueSource().replace('status: todo', 'status: closed'),
        '/tmp/ISSUE-149-test.md',
      ),
    ).toThrow('status must be one of')
    expect(() => parseIssueDocument(issueSource(), '/tmp/ISSUE-150-test.md')).toThrow(
      'filename must start with ISSUE-149-',
    )
  })

  it('rejects malformed issue markdown filenames instead of silently skipping them', () => {
    expect(() => selectIssueFiles(['ISSUE-invalid.md'])).toThrow(
      'filename must match ISSUE-XXX-<slug>.md',
    )
  })

  it('rejects duplicate local and GitHub issue identifiers', () => {
    expect(() =>
      validateUniqueFields([record(), record({ filePath: '/tmp/ISSUE-149-other.md' })]),
    ).toThrow('duplicate id ISSUE-149')
    expect(() =>
      validateUniqueFields([
        record(),
        record({ id: 'ISSUE-150', filePath: '/tmp/ISSUE-150-test.md' }),
      ]),
    ).toThrow('duplicate github_issue #319')
  })

  it('renders a deterministic index independent of discovery order', () => {
    const first = record()
    const second = record({
      id: 'ISSUE-150',
      title: 'Second',
      githubIssue: 320,
      filePath: '/tmp/ISSUE-150-test.md',
    })
    expect(renderIssueIndex([second, first])).toBe(renderIssueIndex([first, second]))
    expect(renderIssueIndex([second, first])).toContain('| `ISSUE-149` | `#319` | `todo` |')
  })

  it('accepts only status-only GitHub input', () => {
    expect(parseGithubIssueStates('[{"number":319,"state":"OPEN"}]')).toEqual([
      { number: 319, state: 'OPEN' },
    ])
    expect(() =>
      parseGithubIssueStates('[{"number":319,"state":"OPEN","title":"must not be present"}]'),
    ).toThrow('may contain only number and state')
  })

  it('reports closed/non-done and open/done drift without body data', () => {
    expect(
      findGithubStateMismatches(
        [
          record({ status: 'review' }),
          record({ id: 'ISSUE-150', githubIssue: 320, status: 'done' }),
        ],
        [
          { number: 319, state: 'CLOSED' },
          { number: 320, state: 'OPEN' },
        ],
      ),
    ).toEqual([
      'ISSUE-149 #319: local=review, github=CLOSED',
      'ISSUE-150 #320: local=done, github=OPEN',
    ])
  })

  it('fails closed when a mapped GitHub issue is missing from the status input', () => {
    expect(findGithubStateMismatches([record()], [])).toEqual([
      'ISSUE-149 #319: local=todo, github=MISSING',
    ])
  })

  it('changes a closed issue status to done without rewriting its body', () => {
    const source = issueSource().replace('status: todo', 'status: review')
    const result = markClosedIssuesDone(source, '/tmp/ISSUE-149-test.md', new Set([319]))
    expect(result.changed).toBe(true)
    expect(result.source).toContain('status: done')
    expect(result.source).toContain('# Test')
  })
})
