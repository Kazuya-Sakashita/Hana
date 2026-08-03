import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error JavaScript CLI exports are exercised directly by Vitest.
import * as breakingWaiverModule from '../../../scripts/check-openapi-breaking-waiver.mjs'

const { reportSha256, validateBreakingWaiver } = breakingWaiverModule

const report = 'WARN synthetic breaking change\n'
const now = new Date('2026-08-03T00:00:00Z')

function approvedWaiver(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    approval_label: 'openapi-breaking-approved',
    waivers: [
      {
        id: 'issue-150-synthetic-contract-change',
        status: 'approved',
        issue: 'ISSUE-150',
        reason: 'The synthetic contract correction matches the deployed behavior.',
        approved_by: 'synthetic-reviewer',
        approved_at: '2026-08-02T00:00:00Z',
        expires_on: '2026-08-31',
        scope: 'openapi-breaking-report',
        report_sha256: reportSha256(report),
        ...overrides,
      },
    ],
  }
}

describe('OpenAPI breaking waiver', () => {
  it('accepts one approved, unexpired waiver for the exact report', () => {
    const result = validateBreakingWaiver({
      report,
      document: approvedWaiver(),
      approvalLabelPresent: true,
      now,
    })

    expect(result.errors).toEqual([])
    expect(result.waiver?.issue).toBe('ISSUE-150')
  })

  it('rejects a proposed waiver', () => {
    const result = validateBreakingWaiver({
      report,
      document: approvedWaiver({ status: 'proposed' }),
      approvalLabelPresent: true,
      now,
    })

    expect(result.errors).toContain(
      'exactly one approved waiver must match the oasdiff report hash',
    )
  })

  it('rejects an expired waiver', () => {
    const result = validateBreakingWaiver({
      report,
      document: approvedWaiver({ expires_on: '2026-08-02' }),
      approvalLabelPresent: true,
      now,
    })

    expect(result.errors).toContain('waiver.expires_on must be a valid future date')
  })

  it('rejects a waiver for a different report without echoing the report', () => {
    const result = validateBreakingWaiver({
      report: 'WARN different synthetic change\n',
      document: approvedWaiver(),
      approvalLabelPresent: true,
      now,
    })

    expect(result.errors.join('\n')).not.toContain('different synthetic change')
    expect(result.waiver).toBeNull()
  })

  it('rejects an in-repo waiver without the external GitHub approval label', () => {
    const result = validateBreakingWaiver({
      report,
      document: approvedWaiver(),
      approvalLabelPresent: false,
      now,
    })

    expect(result.errors).toContain('GitHub PR must have the openapi-breaking-approved label')
  })

  it('trusts only the mounted repository when the action reads the base Git revision', () => {
    const workflow = readFileSync('.github/workflows/openapi-validate.yml', 'utf8')

    expect(workflow).toContain("base: 'origin/${{ github.base_ref }}:docs/openapi/openapi.yaml'")
    expect(workflow).toContain('GIT_CONFIG_COUNT: 1')
    expect(workflow).toContain('GIT_CONFIG_KEY_0: safe.directory')
    expect(workflow).toContain('GIT_CONFIG_VALUE_0: /github/workspace')
    expect(workflow).not.toContain('git config --global')
  })
})
