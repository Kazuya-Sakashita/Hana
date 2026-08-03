import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const adrSource = readFileSync(
  new URL('../../../docs/adr/0017-loop-engineer-approval-boundary.md', import.meta.url),
  'utf8',
)
const runbookSource = readFileSync(
  new URL('../../../docs/api-driven-development/codex-automation-runbook.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-163-loop-engineer-approval-boundary.md', import.meta.url),
  'utf8',
)
const agentsSource = readFileSync(new URL('../../../AGENTS.md', import.meta.url), 'utf8')
const claudeSource = readFileSync(new URL('../../../CLAUDE.md', import.meta.url), 'utf8')

describe('ISSUE-163 Loop Engineer approval boundary', () => {
  it('defines three fail-closed states with an explicit precedence', () => {
    for (const source of [adrSource, runbookSource]) {
      expect(source).toContain('AUTO_MERGE_ELIGIBLE')
      expect(source).toContain('HUMAN_REQUIRED')
      expect(source).toContain('HOLD')
      expect(source).toContain('HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE')
    }

    expect(adrSource).toContain('`HOLD`をmerge可能へ変える運用は採用しない')
    expect(runbookSource).toContain('人間承認で上書きせず')
  })

  it('requires independent latest-SHA reviews and invalidates stale evidence', () => {
    expect(adrSource).toContain('最低3名、最大6名')
    expect(adrSource).toContain('同じ最新commit SHA')
    expect(adrSource).toContain('read-only、独立コンテキスト')
    expect(adrSource).toContain('初回は他reviewerの結論を見ていない')
    expect(adrSource).toContain('未解決actionable findingが0件')
    expect(adrSource).toContain('旧SHAに対するreviewと適格性判定はすべて無効')
    expect(adrSource).toContain('3巡目の終了時')
    expect(adrSource).toContain('多数決で少数意見を消さない')

    for (const role of [
      'Spec / Acceptance',
      'Implementation / Correctness',
      'Test / Reliability',
      'Security / Authorization',
      'AI Safety / Privacy',
      'Database / Migration',
      'API / Contract',
      'UI / Accessibility',
      'Image Pipeline / Privacy',
      'CI / Supply-chain / Operations',
    ]) {
      expect(adrSource).toContain(role)
    }
  })

  it('keeps dangerous and real-environment operations behind human approval', () => {
    for (const operation of [
      '実DB migration適用',
      '実データの削除',
      '実ユーザーデータ',
      'production deploy',
      'secretの作成・読取・変更',
      'AI vendor',
      'GitHub Ruleset',
      'OpenAPI breaking waiver',
      'force push',
      'DB reset',
    ]) {
      expect(adrSource).toContain(operation)
    }

    expect(adrSource).toContain('コードmergeとは別の`HUMAN_REQUIRED`として残す')
    expect(adrSource).toContain('合成データだけを使い、追加専門review')
  })

  it('preserves Codex and Hana safety baselines', () => {
    expect(adrSource).toContain('`approval_policy="on-request"`')
    expect(adrSource).toContain('`approvals_reviewer="auto_review"`')
    expect(adrSource).toContain('`sandbox_mode="workspace-write"`')
    expect(adrSource).toContain('`approval_policy="never"`、Full Access、CI bypass')
    expect(adrSource).toContain('1 Issue / 1 PR、OpenAPI-first')
    expect(adrSource).toContain('PII非保存')
    expect(adrSource).toContain('destructive操作の事前確認')
  })

  it('minimizes evidence and defers activation through ISSUE-167 human GO', () => {
    expect(adrSource).toContain('review prompt全文')
    expect(adrSource).toContain('実ユーザー情報')
    expect(adrSource).toContain('画像URL')
    expect(adrSource).toContain('AI生成本文')
    expect(adrSource).toContain('取得・artifact保存・ログ出力しない')
    expect(adrSource).toContain('ISSUE-167の人間GO後')
    expect(adrSource).toContain('すべてのmergeを`HUMAN_REQUIRED`として扱う')

    for (const source of [agentsSource, claudeSource]) {
      expect(source).toContain('docs/adr/0017-loop-engineer-approval-boundary.md')
      expect(source).toContain('ISSUE-167の人間GOまでは全mergeを人間承認で止める')
    }

    expect(issueSource).toContain('github_issue: 335')
    expect(issueSource).toContain('requires_human_review:')
    expect(issueSource).toContain('PR判定scriptやGitHub Actionsの実装（ISSUE-164）')
    expect(issueSource).toContain('dry-runや実際の自動マージ有効化（ISSUE-167）')
  })
})
