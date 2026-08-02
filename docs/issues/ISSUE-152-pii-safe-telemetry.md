---
id: ISSUE-152
title: PII-safe telemetry集約基盤を作る
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 322
release_gate: observability
requires_human_review:
  - security
  - privacy
  - analytics
---

# ISSUE-152: PII-safe telemetry集約基盤を作る

## 目的 (Why)

API、AI、性能、記録funnelを同じPII-safe telemetry契約で集約する。

## スコープ (What)

- allowlist型の共通event schema
- sampling、保持期間、cardinality、重複契約
- 合成eventからのstatus-only集計
- 未知フィールドと高頻度送信のfail-closed検証

## やらないこと (Out of Scope)

- 外部monitoring providerの本番配線
- PII、画像情報、本文、URL、raw user IDの収集

## 受け入れ条件 (Acceptance Criteria)

- [ ] operation、stable reason、route group、status、duration bucketだけを許可する共通event schemaを定義する
- [ ] request body、生成本文、画像情報、URL、storage key、raw user IDを拒否する
- [ ] sampling、保持期間、cardinality上限、重複eventの扱いを定義する
- [ ] funnel、Web Vitals、API、AIの合成イベントからstatus-only集計を生成できる
- [ ] 未知フィールドと高頻度送信をfail-closedまたはrate limitするテストを追加する
- [ ] API契約変更がある場合はOpenAPIを先に更新する

## セキュリティ・プライバシー考慮

許可リスト外のfieldを拒否し、合成eventだけで検証する。

## 参考

- GitHub Issue #322
- ISSUE-024
- ISSUE-111
