---
id: ISSUE-147
title: AI生成の旧版互換triggerを削除する
priority: P0
status: review
size: S
created_at: 2026-08-02
github_issue: 315
release_gate: mvp_quality
blocked_by:
  - ISSUE-139
requires_human_review:
  - backend
  - reliability
  - operator
---

# ISSUE-147: AI生成の旧版互換triggerを削除する

## 目的 (Why)

ISSUE-139のrolling deploy用に追加した旧Route互換triggerを、Hanaが未公開で旧version trafficが存在しない段階で削除し、新しいAI生成状態機械だけを正本にする。

## スコープ (What)

- 互換triggerを削除するforward-only migrationを追加する
- trigger関数を削除する
- quota列、index、AI生成履歴を維持する
- ISSUE-139とADR-0011のrollout記録を現在状態へ更新する
- migration chain適用後のDB状態とproduction lifecycleをローカルPostgreSQLで検証する

## やらないこと (Out of Scope)

- 現在のSupabaseへのmigration適用（PRマージ後に別途Operator承認）
- アプリの公開・デプロイ
- AI API responseや画面の変更
- AI生成履歴の削除・再集計

## 影響範囲

- Prisma migration chain
- AI生成のローカルDB統合テスト
- ADR-0011とISSUE-139の運用記録
- OpenAPI、生成型、画面、API responseには影響しない

## テスト境界

- 公開境界は、全migration適用後のDB schemaとproduction lifecycle関数とする
- schemaでは互換trigger / 関数の不存在とquota列 / indexの維持を確認する
- lifecycleではclaim、finalize、stale回収、UTC月quotaを合成データで確認する
- 実ユーザーDBや旧Routeの内部実装をテスト境界にしない

## 受け入れ条件 (Acceptance Criteria)

- [x] migration chain適用後に互換triggerと関数が存在しない
- [x] `quota_counted_at`列とindexを維持する
- [x] 新状態機械のclaim / finalize / stale回収 / UTC月quotaが通る
- [x] 旧Route互換専用テストを最終DB状態から除去する
- [x] ISSUE-139のDeployment stateとADRが現在状態に一致する
- [x] `pnpm pr:gate`とDB統合検証が成功する
- [ ] Backend / Reliability / Operatorレビューを完了する

## 検証結果

- TDD RED: 互換trigger / 関数が残る既存migration chainで期待どおり失敗
- TDD GREEN: 削除migration適用後、DB統合2件成功
- fresh migration chain: 空のローカルPostgreSQLへ14件を適用して成功
- focused test: 38件成功
- `pnpm pr:gate`: 1109件成功、DB条件付き2件skip
- Standardsレビュー: GO、指摘0件
- Specレビュー: GO、指摘0件

## セキュリティ・プライバシー考慮

- migrationはtriggerと関数だけを削除し、行データを削除・再集計しない
- 実データ、生成本文、画像、prompt、接続情報をログ・テスト・PR証跡へ含めない
- DB統合テストは`localhost`の`hana_ci`と合成データだけを使う
- 現在のSupabaseへ適用する前に、未適用migrationが本Issueの1件だけであることを再確認する

## 人間レビュー

- [x] Backend: forward-only migrationがtrigger / 関数だけを削除する（2026-08-02承認）
- [x] Reliability: 最終schemaと新状態機械のDB統合検証（2026-08-02承認）
- [ ] Operator: Hanaが未公開で旧version trafficが存在しないこと、および実DB適用手順

## 参考

- GitHub Issue #315
- ISSUE-139
- ADR-0011
