import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflowSource = readFileSync(
  new URL('../../../.github/workflows/issue-registry.yml', import.meta.url),
  'utf8',
)

describe('issue registry workflow', () => {
  it('is valid YAML with read-only repository permissions', () => {
    expect(parse(workflowSource)).toBeTypeOf('object')
    expect(workflowSource).toContain('contents: read')
    expect(workflowSource).toContain('issues: read')
    expect(workflowSource).not.toMatch(/contents:\s*write|issues:\s*write/)
  })

  it('requests and persists only issue number and state in a temporary file', () => {
    expect(workflowSource).toContain('--json number,state')
    expect(workflowSource).toContain('$RUNNER_TEMP/issue-statuses.json')
    expect(workflowSource).not.toMatch(/--json[^\n]*(body|comments|author|title|url)/)
    expect(workflowSource).not.toContain('upload-artifact')
  })

  it('checks local generation on pull requests and live state only outside pull requests', () => {
    expect(workflowSource).toContain('pull_request:')
    expect(workflowSource).toContain('pnpm issues:check')
    expect(workflowSource).toContain("if: github.event_name != 'pull_request'")
    expect(workflowSource).toContain('pnpm issues:check-github')
  })
})
