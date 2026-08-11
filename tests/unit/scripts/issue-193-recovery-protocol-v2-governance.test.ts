import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type JsonPrimitive = boolean | number | string | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue } | undefined
type JsonObject = { [key: string]: JsonValue }

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const governanceRoot = resolve(repositoryRoot, 'docs/governance/loop-engineer')

const readBytes = (fileName: string) => readFileSync(resolve(governanceRoot, fileName))
const readJson = (fileName: string) =>
  JSON.parse(readBytes(fileName).toString('utf8')) as JsonObject

const canonicalize = (value: JsonValue): string => {
  if (value === undefined) {
    throw new Error('undefined is not valid canonical JSON')
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new Error('value is not valid canonical JSON')
  }
  return encoded
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const canonicalDigest = (value: JsonValue) => sha256(canonicalize(value))
const lineSetDigest = (values: string[]) => sha256(`${[...values].sort().join('\n')}\n`)

const terminalManifest = readJson('issue-177-round5-terminal-manifest.json')
const provenance = readJson('frozen-artifact-provenance.json')
const bindingInputs = readJson('recovery-protocol-v2-binding-inputs.json')
const charter = readJson('recovery-protocol-v2-charter.json')

const asObject = (value: JsonValue) => value as JsonObject
const asObjects = (value: JsonValue) => value as JsonObject[]
const asStrings = (value: JsonValue) => value as string[]

describe('ISSUE-193 recovery protocol v2 governance', () => {
  it('preserves the exact Round 5 campaign and the complete meaning of all six P1 findings', () => {
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
    expect(terminalManifest.role_results).toEqual([
      { role: 'security', p0: 0, p1: 4, verdict: 'hold' },
      { role: 'operations', p0: 0, p1: 4, verdict: 'hold' },
      { role: 'repository_owner_perspective', p0: 0, p1: 3, verdict: 'hold' },
    ])

    const findings = asObjects(terminalManifest.findings)
    expect(findings.map(({ id }) => id)).toEqual([
      'R5-GLOBAL-LINEAGE-UNIQUENESS',
      'R5-VERIFIER-AUTHENTICITY-REPLAY',
      'R5-SUCCESS-CROSS-RECORD-BINDING',
      'R5-ATTEMPT-BOUNDS',
      'R5-MAIN-REFRESH-REACHABILITY',
      'R5-INVENTORY-FRESHNESS-PROOF',
    ])
    expect(findings.map(({ source_finding }) => source_finding)).toEqual([
      'anchor / succession一意性がcaller-controlledなlineage_id内に限定され、同じ凍結source / targetを別lineageとして再登録できる。凍結source値も機械定数ではない。',
      'trusted verifier receiptの真正性、receipt digest導出、repository / audience、lineage全inventoryでのapproval / authorization ID・nonce・run replayがaggregate検証されない。',
      'approval、Owner authorization、progression、attempt、fencing generation / token、barrier、projectionの完全joinとlatest / active状態が不足し、別head・失効済み状態のspliceを閉じていない。',
      '1 round最大3 attempt、1 lineage最大15 attemptは定数確認だけで、aggregate validatorが4件目 / 16件目を拒否しない。',
      'mainだけが移動した場合に同じprogressionをfresh receiptで再試行する文書経路と、progression / attemptのapproval・Owner digest不変条件が両立しない。',
      'successに必要なpagination完全性、Check identity一意性、GitHub側atomic main freshness、rollback invalidator generationの証跡が完全traceのtrusted inputとして検証されない。',
    ])
    expect(findings.every(({ severity }) => severity === 'P1')).toBe(true)
    expect(new Set(findings.map(({ id }) => id)).size).toBe(6)

    const findingText = canonicalize(findings)
    for (const requiredMarker of [
      'repository ID',
      'receipt digest',
      'latest active',
      'exact barrier inventory',
      'sixteenth attempt in one lineage',
      'main-only movement',
      'hasNextPage=false',
      'rollback failure',
    ]) {
      expect(findingText).toContain(requiredMarker)
    }
    expect(findingText).not.toContain('sixteenth attempt in a program')
  })

  it('recomputes every static grant binding from canonical source projections', () => {
    const digests = asObject(charter.binding_digests)
    const reviewPolicy = asObject(bindingInputs.review_policy)

    expect(digests).toMatchObject({
      terminal_manifest_sha256: sha256(readBytes('issue-177-round5-terminal-manifest.json')),
      requirements_sha256: canonicalDigest(terminalManifest.findings),
      binding_inputs_file_sha256: sha256(readBytes('recovery-protocol-v2-binding-inputs.json')),
      threat_model_sha256: canonicalDigest(bindingInputs.threat_model),
      artifact_scope_sha256: canonicalDigest(bindingInputs.artifact_scope),
      input_allowlist_sha256: canonicalDigest(bindingInputs.input_allowlist),
      provenance_file_sha256: sha256(readBytes('frozen-artifact-provenance.json')),
      forbidden_artifacts_sha256: canonicalDigest(provenance.frozen_sources),
      review_policy_sha256: canonicalDigest(bindingInputs.review_policy),
      principal_set_sha256: canonicalDigest(reviewPolicy.principal_set),
      grant_contract_sha256: canonicalDigest(bindingInputs.grant_record_contract),
      main_freshness_sha256: canonicalDigest(bindingInputs.main_freshness),
    })

    const reviewHistory = asObject(charter.review_history)
    expect(digests.d1_evaluation_set_sha256).toBe(canonicalDigest(reviewHistory.D1))
    expect(digests.v1_evaluation_set_sha256).toBe(canonicalDigest(reviewHistory.V1))
    expect(digests.binding_payload_sha256).toBe(canonicalDigest(charter.grant_binding_payload))
    expect(JSON.stringify(charter)).not.toContain('TO_BE_COMPUTED')
  })

  it('materializes deterministic frozen commit, blob, patch, path, and object inventories', () => {
    const frozenSources = asObjects(provenance.frozen_sources)
    expect(
      frozenSources.map(({ pull_request, base_sha, head_sha }) => ({
        pull_request,
        base_sha,
        head_sha,
      })),
    ).toEqual([
      {
        pull_request: 355,
        base_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
        head_sha: '1239936947aed0f198216a2c8bf4be3177eb2223',
      },
      {
        pull_request: 361,
        base_sha: 'fbd5250251ce42d2d1505c685e3f01459d979c0e',
        head_sha: '514d8c64d252b22fb84f7b7834ae690025896882',
      },
      {
        pull_request: 389,
        base_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
        head_sha: '24a85f9ed31c28d3a14ede45f891a1386699be9e',
      },
    ])

    for (const source of frozenSources) {
      const commits = asStrings(source.commit_oids)
      const blobs = asStrings(source.branch_only_blobs)
      const patchIds = asStrings(source.stable_patch_ids)
      const paths = asStrings(source.changed_paths)

      expect(commits).toEqual([...commits].sort())
      expect(blobs).toEqual([...blobs].sort())
      expect(patchIds).toEqual([...patchIds].sort())
      expect(paths).toEqual([...paths].sort())
      expect(new Set(commits).size).toBe(commits.length)
      expect(new Set(blobs).size).toBe(blobs.length)
      expect(new Set(patchIds).size).toBe(patchIds.length)
      expect(source.commit_inventory_count).toBe(commits.length)
      expect(source.commit_inventory_sha256).toBe(lineSetDigest(commits))
      expect(source.path_inventory_sha256).toBe(lineSetDigest(paths))
      expect(patchIds).toHaveLength(commits.length)
      expect(source.object_inventory_count).toBeGreaterThan(commits.length + blobs.length)
      expect(source.object_inventory_sha256).toMatch(/^[0-9a-f]{64}$/)
    }

    const origin = asObject(provenance.origin_main_allowlist)
    expect(origin).toMatchObject({
      commit_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
      tree_sha: 'd5ad1d1671beed07daba99800ac3ea2ab0f56148',
      tree_inventory_count: 950,
      tree_inventory_sha256: 'e3a2e27c4bd3d3c0024f96b9fdf26c3ec579269b7015f3f9ac4f3b07a0f58fff',
    })
    expect(canonicalize(provenance.candidate_rules)).toContain('stable patch id')
  })

  it('fixes three principals and a mandatory finite D1/V1/V2 state machine', () => {
    const reviewPolicy = asObject(bindingInputs.review_policy)
    const principals = asObjects(reviewPolicy.principal_set)
    expect(principals).toEqual([
      { role: 'security', principal_id: '/root/gov_security_counsel' },
      { role: 'operations', principal_id: '/root/gov_liveness_architect' },
      {
        role: 'repository_owner_perspective',
        principal_id: '/root/gov_delivery_designer',
      },
    ])
    expect(new Set(principals.map(({ principal_id }) => principal_id)).size).toBe(3)

    const reviewBudget = asObject(reviewPolicy.review_budget)
    expect(reviewBudget).toMatchObject({
      required_stage_bundles_per_deliverable: ['D1', 'V1', 'V2'],
      max_stage_bundles_per_deliverable: 3,
      max_remediation_batches_per_deliverable: 1,
      max_stage_bundles_total: 12,
      max_remediation_batches_total: 4,
      attempt_to_exceed_budget_is_terminal: true,
      normal_v2_completion_exhausts_but_does_not_violate_budget: true,
      budget_reset_by_issue_pr_branch_head_scope_or_principal: false,
    })
    expect(canonicalize(reviewPolicy.stage_machine)).toContain(
      'V1 P1=0; V2 remains mandatory on the same head',
    )

    const history = asObject(charter.review_history)
    const v1 = asObject(history.V1)
    expect(v1).toMatchObject({
      reviewed_base_main_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
      reviewed_head_sha: '90d42a9b7ee131191995412191d1a962c4ad07fb',
      comment_id: 5249358797,
      finding_set_sha256: '3b1ca32844c28b2a05ae01ff833188df0352204a69b6c241c61855b911e7069a',
    })
    expect(v1.remediation).toEqual({
      finding_backlog_sha256: '3b1ca32844c28b2a05ae01ff833188df0352204a69b6c241c61855b911e7069a',
      batch: 1,
      maximum_batches: 1,
      consumed: true,
      next_stage: 'V2',
      another_v1_allowed: false,
    })
    expect(history.V2).toMatchObject({
      state: 'pending_external_exact_final_head_bundle',
      required_even_when_v1_is_go: true,
    })
    expect(asStrings(charter.terminal_conditions)).not.toContain('review_budget_exhausted')
    expect(asStrings(charter.terminal_conditions)).toContain('attempt_to_exceed_review_budget')
  })

  it('defines a single authenticated grant record and fail-closed immutable state reduction', () => {
    const contract = asObject(bindingInputs.grant_record_contract)
    const storage = asObject(contract.storage)
    const constants = asObject(contract.issued_record_constants)
    const requiredFields = asStrings(contract.issued_record_required_fields)

    expect(storage).toMatchObject({
      medium: 'GitHub Issue comment',
      repository_id: 1238189306,
      issue_number: 390,
      author_id: 64903209,
      author_association: 'OWNER',
      immutable_envelope: 'updated_at must equal created_at',
    })
    expect(constants).toMatchObject({
      repository_id: 1238189306,
      repository_node_id: 'R_kgDOSc1E-g',
      issue_number: 390,
      pull_request_number: 391,
      owner_principal_id: 64903209,
      audience: 'hana-recovery-protocol-v2-transition',
      decision: 'issue',
      program_id: 'hana-loop-engineer-recovery-v2',
      protocol_major: 2,
    })
    expect(new Set(requiredFields).size).toBe(requiredFields.length)
    for (const field of [
      'decision_main_sha',
      'final_governance_head_sha',
      'final_governance_tree_sha',
      'principal_set_sha256',
      'd1_evaluation_set_sha256',
      'v1_evaluation_set_sha256',
      'v2_evaluation_set_sha256',
      'binding_payload_sha256',
      'nonce_sha256',
      'expires_at',
    ]) {
      expect(requiredFields).toContain(field)
    }

    const stateMachine = canonicalize(contract.state_reducer)
    expect(stateMachine).toContain('Two or more matching issued records')
    expect(stateMachine).toContain('exact GitHub merge and accepted-readback invariants')
    expect(stateMachine).toContain('immutable terminal states')
    expect(stateMachine).toContain('program_halted')
    expect(contract.unknown_fields).toBe('reject')

    const mainFreshness = asObject(bindingInputs.main_freshness)
    expect(mainFreshness).toMatchObject({
      main_movement:
        'Any main movement after V2 terminally rejects and consumes this transition; no refresh, rebase, update-branch, new head, or extra review is allowed.',
      refresh_budget: 0,
    })
    expect(canonicalize(mainFreshness)).toContain('merge commit first parent')
    expect(canonicalize(mainFreshness)).toContain('accepted main tree')
  })

  it('keeps normative documents aligned without Round 6, stale acceptance, or Owner waiver language', () => {
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

    const adr = documents[2]
    expect(adr).toContain('- Status: proposed')
    expect(adr).not.toContain('- Status: accepted')

    const joined = documents.join('\n')
    for (const marker of [
      'protocol_v2_transition_grant',
      'independent successor',
      'JSON-only',
      'mandatory V2',
      'ACCEPTED_CONSUMED',
      'program_halted',
      'pre-activation human GO',
    ]) {
      expect(joined).toContain(marker)
    }

    expect(charter).toMatchObject({
      policy_state: 'governance_candidate',
      runtime_activation_state: 'blocked',
    })
    expect(asObject(charter.activation).state).toBe('blocked')
  })
})
