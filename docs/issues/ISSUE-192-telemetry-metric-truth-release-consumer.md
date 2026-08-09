---
id: ISSUE-192
title: 'ISSUE-191置換: telemetry metric truthとrelease consumerをfail closedにする'
priority: P1
status: review
size: M
created_at: 2026-08-09
github_issue: 387
release_gate: observability
requires_human_review:
  - security
  - privacy
  - analytics
  - api_contract
  - adversarial
  - spec_ops
---

# ISSUE-192: ISSUE-191置換: telemetry metric truthとrelease consumerをfail closedにする

## 目的 (Why)

PR #386のRound 3 terminal HOLDを新しいIssue / PR lineageへ分離し、evidence signerをcaller指定claimの署名oracleにしない。

## スコープ (What)

- source SHAをprotected deployment identity、生成時刻をsigner clockから導出する
- 必須5 ProductEvent operationをexact setとしてauthority、universe、aggregate receiptへ拘束する
- eligible / success / censorを別key署名済みmetric aggregate receiptから再導出する
- M2 / M3 / M8 / M9をDB / Memory truth commitmentへ拘束する
- ISSUE-162のrelease consumerへwhole-artifact fail-closed検証を必須化する
- ISSUE-191の実装を新しいquery / evidence schemaへ移行する

## やらないこと (Out of Scope)

- PR #386の再開、Round 4、merge
- ISSUE-191のreview、waiver、labelを合格証拠として再利用すること
- raw actor、raw event、exact count、PIIをstatus-only artifactへ出すこと
- 本番telemetry activation、退会purge、durable degradation ledger

## 影響範囲

- OpenAPI、生成型、ProductEvent / Web Vitals client・route・serverへ影響する
- telemetry evidence builder、aggregate receipt、baseline / target decisionへ影響する
- PRD、observability、funnel、ISSUE-159 / 162 / 185の依存契約へ影響する
- ISSUE-172のgate実装とは`docs/issues/README.md`以外の実装ファイルを共有しない
- OpenAPI破壊差分は新しいexact reportと人間承認までHOLDする

## 受け入れ条件 (Acceptance Criteria)

- [x] callerが任意のsource SHA、未来時刻、未認証countをevidence keyで署名させられない
- [x] `record_started` / `photo_selected` / `ai_draft_shown` / `memory_saved` / `memory_viewed`の欠落・追加・置換をfail closedにする
- [x] metric aggregate receiptを別key、query、actor、window、cohort、operation set、authority / universeへ署名する
- [x] eligible / success / censorをreceiptから再導出し、`distinct_profiles <= eligible`を含む不変条件を強制する
- [x] M2 / M3 / M8 / M9はDB / Memory truth commitment欠落時にevidenceを生成しない
- [x] count、窓、operation、source SHA、時刻、receipt lineageの改変testを追加する
- [x] ISSUE-162はv7 whole-artifact HMAC、exact M1-M12、nested exact schema、funnel伝播、top-level status、main SHA、evaluation roleをhuman review前に検証する
- [x] status-onlyを維持し、raw actor、raw event、exact count、秘密値、PIIをartifact / logへ含めない
- [x] focused / full test、typecheck、lint、OpenAPI lint / gen、`pnpm pr:gate`、`git diff --check`を通す
- [ ] 新しいbase / headのexact breaking report、期限付きwaiver、人間承認を取得する
- [ ] fixed base / head SHAを6専門roleがfresh Round 1からreviewし、全role GOまでmergeしない

## セキュリティ・プライバシー考慮

evidence signerはaggregate keyを持たず、署名済みreceiptを検証してstatus-only commitmentへ変換する。private cohort、DB / Memory集合、件数はcommitmentの外へ出さない。

## 検証結果

- focused integration 34件、全test 2,022件（23件skip）をPASS
- format、lint、Issue registry、OpenAPI route / auth contract、typecheck、全contract QAをPASS
- sandboxのport bind制限で停止したproduction buildは同一環境変数の権限付き`pnpm build:ci`でPASS
- 固定oasdiff imageによる`origin/main`との差分は21件（error 16 / warning 5）
- GitHub Action互換の改行正規化後exact report SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`
- waiverはISSUE-192名義の`proposed`としてhashだけを固定し、人間承認と期限、保護labelは未設定

## 参考

- GitHub Issue #387
- ISSUE-191 / GitHub Issue #385
- PR #386（Round 3 terminal HOLD、未マージ）
- ISSUE-159
- ISSUE-162
- ADR-0020
- ADR-0021
