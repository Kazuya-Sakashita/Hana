import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/evaluate-database-evidence-paths.ts', import.meta.url),
)
const root = fileURLToPath(new URL('../../..', import.meta.url))
const baseCommitSha = 'a'.repeat(40)
const headCommitSha = 'b'.repeat(40)
const baseTreeSha = 'c'.repeat(40)
const headTreeSha = 'd'.repeat(40)

function blob(path: string, sha: string) {
  return { path, mode: '100644', type: 'blob', sha }
}

function tree(sha: string, entries: Array<ReturnType<typeof blob>>) {
  return { sha, truncated: false, tree: entries }
}

function input(
  baseEntries: Array<ReturnType<typeof blob>>,
  headEntries: Array<ReturnType<typeof blob>>,
) {
  return {
    schema_version: 'loop-engineer-database-evidence-tree-input/v2',
    base_commit_sha: baseCommitSha,
    head_commit_sha: headCommitSha,
    base_tree_sha: baseTreeSha,
    head_tree_sha: headTreeSha,
    base_tree: tree(baseTreeSha, baseEntries),
    head_tree: tree(headTreeSha, headEntries),
  }
}

function classify(value: unknown) {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath], {
    cwd: root,
    encoding: 'utf8',
    input: typeof value === 'string' ? value : JSON.stringify(value),
  })
}

function expectClassification(value: unknown, expected: 'true' | 'false') {
  const result = classify(value)
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toBe(`${expected}\n`)
}

describe('ISSUE-184 trusted database evidence tree classifier', () => {
  it.each([
    'prisma/schema.prisma',
    'src/app/page.tsx',
    'src/server/db/child-persistence.ts',
    'src/features/children/server/parse.ts',
    'scripts/maintenance/issue-137-sanitize-existing-images.ts',
    'scripts/qa/issue-151-bootstrap-postgres.mjs',
    'tests/integration/v1/children.test.ts',
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    '.github/workflows/database.yml',
    'scripts/new-database-runner.mjs',
    'docs/runtime/database-adapter.ts',
    'public/database-config.js',
  ])('requires database evidence when exact trees change %s', (path) => {
    expectClassification(input([blob(path, '1'.repeat(40))], [blob(path, '2'.repeat(40))]), 'true')
  })

  it('classifies both sides of a sensitive-to-documentation rename', () => {
    expectClassification(
      input(
        [blob('prisma/schema.prisma', '1'.repeat(40))],
        [blob('docs/schema.txt', '1'.repeat(40))],
      ),
      'true',
    )
  })

  it('fails closed for executable governance and test paths that are not explicit documentation', () => {
    expectClassification(
      input(
        [blob('docs/readme.md', '1'.repeat(40))],
        [
          blob('docs/readme.md', '2'.repeat(40)),
          blob('.github/workflows/loop-engineer-merge-gates.yml', '3'.repeat(40)),
          blob('scripts/loop-engineer/evaluate-database-evidence-paths.ts', '4'.repeat(40)),
          blob(
            'tests/unit/app/loop-engineer-github-merge-controls-contract.test.ts',
            '5'.repeat(40),
          ),
        ],
      ),
      'true',
    )
  })

  it('cannot bypass evidence by rewiring a database import outside src', () => {
    expectClassification(
      input(
        [
          blob('tsconfig.json', '1'.repeat(40)),
          blob('docs/runtime/database-adapter.ts', '2'.repeat(40)),
        ],
        [
          blob('tsconfig.json', '3'.repeat(40)),
          blob('docs/runtime/database-adapter.ts', '4'.repeat(40)),
        ],
      ),
      'true',
    )
  })

  it('does not require database evidence for documentation-only changes', () => {
    expectClassification(
      input(
        [blob('docs/issues/ISSUE-184-loop-engineer-dedicated-db-gate.md', '1'.repeat(40))],
        [blob('docs/issues/ISSUE-184-loop-engineer-dedicated-db-gate.md', '2'.repeat(40))],
      ),
      'false',
    )
  })

  it.each(['AGENTS.md', 'CLAUDE.md', 'Hana_PRD_v1.md', 'README.md'])(
    'allows the reviewed root documentation path %s',
    (path) => {
      expectClassification(
        input([blob(path, '1'.repeat(40))], [blob(path, '2'.repeat(40))]),
        'false',
      )
    },
  )

  it('requires evidence for non-Markdown files under docs', () => {
    expectClassification(
      input(
        [blob('docs/api-driven-development/policy.json', '1'.repeat(40))],
        [blob('docs/api-driven-development/policy.json', '2'.repeat(40))],
      ),
      'true',
    )
  })

  it.each([
    null,
    '{',
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      extra: true,
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      head_commit_sha: baseCommitSha,
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      head_tree: tree(headTreeSha, []),
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      head_tree: {
        ...tree(headTreeSha, [blob('docs/a.md', '2'.repeat(40))]),
        truncated: true,
      },
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      base_tree: tree(baseCommitSha, [blob('docs/a.md', '1'.repeat(40))]),
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      head_tree_sha: baseTreeSha,
    },
    {
      ...input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '2'.repeat(40))]),
      schema_version: 'loop-engineer-database-evidence-tree-input/v1',
    },
    input([blob('docs/a.md', '1'.repeat(40))], [blob('docs/a.md', '1'.repeat(40))]),
  ])('fails closed for malformed, truncated, or unchanged tree input %#', (value) => {
    const result = classify(value)

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('true\n')
  })
})
