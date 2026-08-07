import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/evaluate-database-evidence-paths.ts', import.meta.url),
)
const root = fileURLToPath(new URL('../../..', import.meta.url))

function classify(input: unknown) {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath], {
    cwd: root,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
  })
}

describe('ISSUE-184 trusted database evidence path classifier', () => {
  it.each([
    'prisma/schema.prisma',
    'prisma/migrations/20260803031500_add_child_rls_tracer/migration.sql',
    'src/server/db/child-persistence.ts',
    'src/app/v1/children/route.ts',
    'src/app/internal/account-deletion-purges/route.ts',
    'src/features/children/server/parse.ts',
    'scripts/qa/issue-151-bootstrap-postgres.mjs',
    'tests/integration/v1/children.test.ts',
    '.github/workflows/loop-engineer-merge-gates.yml',
    '.github/workflows/typecheck.yml',
    'package.json',
  ])('requires database evidence for %s', (path) => {
    const result = classify([path])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('true\n')
  })

  it('does not require database evidence for unrelated documentation and UI files', () => {
    const result = classify([
      'docs/issues/ISSUE-170-loop-engineer-bootstrap-evidence.md',
      'src/components/product/icons.tsx',
    ])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('false\n')
  })

  it.each([null, [], ['docs/readme.md', 'docs/readme.md'], ['../prisma/schema.prisma'], '{'])(
    'fails closed for malformed or ambiguous input %#',
    (input) => {
      const result = classify(input)

      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe('true\n')
    },
  )
})
