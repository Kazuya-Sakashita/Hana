import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const terminalManifestPath = resolve(
  repositoryRoot,
  'docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json',
)
const charterPath = resolve(
  repositoryRoot,
  'docs/governance/loop-engineer/recovery-protocol-v2-charter.json',
)

const terminalManifestBytes = readFileSync(terminalManifestPath)
const terminalManifest = JSON.parse(terminalManifestBytes.toString('utf8')) as Record<
  string,
  unknown
>
const charter = JSON.parse(readFileSync(charterPath, 'utf8')) as Record<string, unknown>

describe('ISSUE-193 recovery protocol v2 governance', () => {
  it('freezes the exact Round 5 terminal campaign and all six P1 requirements', () => {
    expect(terminalManifest.campaign).toEqual({
      issue_id: 'ISSUE-177',
      github_issue: 362,
      pull_request: 389,
      base_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
      head_sha: '24a85f9ed31c28d3a14ede45f891a1386699be9e',
      round: 5,
      result: 'terminal_hold',
    })
    expect(terminalManifest.exception_evidence).toEqual({
      workflow_run_id: 31459233974,
      workflow_head_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
      check_run_id: 93679465377,
      check_name: 'review-round-exception',
      check_app_id: 4483496,
      check_head_sha: '24a85f9ed31c28d3a14ede45f891a1386699be9e',
      check_external_id:
        'loop-engineer-review-round-exception/v1|ISSUE-177|389|e6c891ecde1ba3f51b739361d3cd3de4433835a3|24a85f9ed31c28d3a14ede45f891a1386699be9e|5',
    })

    const roleResults = terminalManifest.role_results as Array<Record<string, unknown>>
    expect(roleResults).toEqual([
      { role: 'security', p0: 0, p1: 4, verdict: 'hold' },
      { role: 'operations', p0: 0, p1: 4, verdict: 'hold' },
      { role: 'repository_owner_perspective', p0: 0, p1: 3, verdict: 'hold' },
    ])

    const findings = terminalManifest.findings as Array<Record<string, unknown>>
    expect(findings.map(({ id }) => id)).toEqual([
      'R5-GLOBAL-LINEAGE-UNIQUENESS',
      'R5-VERIFIER-AUTHENTICITY-REPLAY',
      'R5-SUCCESS-CROSS-RECORD-BINDING',
      'R5-ATTEMPT-BOUNDS',
      'R5-MAIN-REFRESH-REACHABILITY',
      'R5-INVENTORY-FRESHNESS-PROOF',
    ])
    expect(new Set(findings.map(({ id }) => id)).size).toBe(6)
    expect(findings.every(({ severity, requirement }) => severity === 'P1' && requirement)).toBe(
      true,
    )
  })

  it('binds the v2 charter to the exact terminal manifest bytes and forbidden heads', () => {
    const terminalDigest = createHash('sha256').update(terminalManifestBytes).digest('hex')
    expect(charter.terminal_manifest).toEqual({
      path: 'docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json',
      sha256: terminalDigest,
    })

    const inputPolicy = charter.input_policy as Record<string, unknown>
    expect(inputPolicy.forbidden_sources).toEqual([
      { pull_request: 355, head_sha: '1239936947aed0f198216a2c8bf4be3177eb2223' },
      { pull_request: 361, head_sha: '514d8c64d252b22fb84f7b7834ae690025896882' },
      { pull_request: 389, head_sha: '24a85f9ed31c28d3a14ede45f891a1386699be9e' },
    ])
    expect(inputPolicy.allowed).toEqual([
      'origin_main_tree',
      'terminal_manifest_metadata',
      'six_stable_finding_requirements',
      'public_standards',
      'new_v2_requirements_and_threat_model',
    ])
    expect(inputPolicy.forbidden).toContain('frozen_artifact_as_oracle_or_success_evidence')
  })

  it('keeps the grant unissued and enforces a finite non-resettable program', () => {
    expect(charter).toMatchObject({
      program_id: 'hana-loop-engineer-recovery-v2',
      protocol_major: 2,
      state: 'governance_charter',
      origin_main_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
    })

    const deliverables = charter.fixed_deliverables as Array<Record<string, unknown>>
    expect(deliverables.map(({ id }) => id)).toEqual(['G0', 'G1', 'G2', 'G3'])
    expect(deliverables.every(({ privileged }) => privileged === false)).toBe(true)

    expect(charter.transition_grant).toMatchObject({
      storage: 'external_status_only_exact_head_record',
      initial_state: 'not_issued',
      allowed_states: ['not_issued', 'issued', 'accepted', 'rejected', 'expired'],
      issuer: 'repository_owner',
      single_use: true,
      non_delegable: true,
      terminal_states: ['accepted', 'rejected', 'expired'],
    })
    expect(charter.review_budget).toEqual({
      stages_per_deliverable: ['D1', 'V1', 'V2'],
      max_specialist_snapshots_per_deliverable: 3,
      max_remediation_batches_per_deliverable: 1,
      max_specialist_snapshots_total: 12,
      max_remediation_batches_total: 4,
      principal_roles: ['security', 'operations', 'repository_owner_perspective'],
      principal_replacement_allowed: false,
      budget_reset_by_issue_pr_branch_head_or_scope: false,
    })

    const activation = charter.activation as Record<string, unknown>
    expect(activation.state).toBe('blocked')
    expect(activation.blocked_operations).toEqual([
      'recovery_credential_issuance',
      'succession_consumption',
      'check_creation_or_update',
      'merge_eligibility_projection',
      'runtime_activation',
    ])
  })

  it('keeps the normative documents aligned without Round 6 or owner waiver language', () => {
    const documents = [
      'AGENTS.md',
      'docs/adr/0017-loop-engineer-approval-boundary.md',
      'docs/adr/0018-terminal-hold-independent-successor.md',
      'docs/api-driven-development/codex-automation-runbook.md',
      'docs/issues/ISSUE-193-recovery-protocol-v2-governance.md',
    ].map((filePath) => readFileSync(resolve(repositoryRoot, filePath), 'utf8'))

    for (const document of documents) {
      expect(document).not.toContain('Round 6を例外的に許可する')
      expect(document).not.toContain('Round 5のround countをresetする')
      expect(document).not.toContain('Ownerは理由を記録すれば制約をwaiveできる')
    }

    const joined = documents.join('\n')
    for (const marker of [
      'protocol_v2_transition_grant',
      'independent successor',
      'D1',
      'V1',
      'V2',
      'pre-activation human GO',
    ]) {
      expect(joined).toContain(marker)
    }
  })
})
