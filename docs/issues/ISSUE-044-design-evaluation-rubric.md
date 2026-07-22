---
id: ISSUE-044
title: Hana に合うデザイン評価手法を定義する
priority: P1
status: review
size: M
created_at: 2026-07-23
parent: DESIGN
github_issue: 91
requires_human_review:
  - design
  - privacy
---

## 目的 (Why)

Hana のアプリ思想に合うデザイン評価手法を定義する。一般的な UI チェックだけではなく、Hana らしさである「責めない」「写真が記憶に変わる」「親が安心して残せる」「AI が出しゃばらない」を評価できる基準にする。

## スコープ (What)

- 複数の専門家観点で評価軸を議論する前提を作る
  - UX Research
  - Product Design
  - Visual / Brand
  - Content Design
  - Accessibility
  - Privacy / Trust
  - Engineering Feasibility
- HEART 評価を Hana 向けに再定義する
- ヒューリスティック評価を Hana 向けに拡張する
- 画面単位・フロー単位・リリース前の評価チェックリストを作る
- 評価結果を Issue / PR に残すフォーマットを定義する

## 評価候補

- HEART: Happiness / Engagement / Adoption / Retention / Task Success
- Usability Heuristics: 迷わない、戻れる、失敗しても責めない
- Emotional Resonance: 保存したい、読み返したい、泣ける、押し付けがましくない
- Privacy Trust: 写真・子ども情報・AI 送信への不安を増やさない
- Content Safety: 発達評価、断定、罪悪感、親への圧を避ける
- Accessibility: 文字サイズ、コントラスト、タップ領域、読み上げ、motion
- Design System Consistency: token / component / spacing / typography の一貫性
- Performance Perception: 待ち時間の感じ方、AI生成中の不安、画像表示の体感

## やらないこと (Out of Scope)

- この Issue では画面実装をしない
- 評価軸を数値だけに寄せない
- 実ユーザーの個人情報や画像本文を証跡に残さない

## 影響範囲

| 領域         | 影響                                      |
| ------------ | ----------------------------------------- |
| OpenAPI      | なし                                      |
| 生成型       | なし                                      |
| アプリコード | なし                                      |
| ドキュメント | デザイン評価 Rubric、Design Review Report |
| 運用         | デザイン PR / Issue のレビュー基準        |

## 受け入れ条件 (Acceptance Criteria)

- [x] Hana Design Evaluation Rubric が定義されている
- [x] 5段階または Go / Hold / No-Go の判定基準がある
- [x] HEART を Hana 向けに翻訳した指標がある
- [x] Privacy / Trust / Emotional Resonance が独立評価軸として含まれている
- [x] サブエージェント複数名で議論するためのレビュー依頼テンプレートがある
- [x] PR に添付する Design Review Report テンプレートがある
- [x] ISSUE-045 の棚卸しで使える評価表になっている
- [x] `docs/design/design-evaluation-rubric.md` が追加されている
- [x] `pnpm pr:gate` が通る

## サブエージェント検討

3名の read-only サブエージェントで並行検討した。

| 観点                         | 反映内容                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| UX Research / HEART          | Hana版HEART、観察証跡、5段階評価、Go / Hold / No-Go 閾値を反映         |
| Privacy / Trust / Content    | Privacy Trust、Emotional Resonance、Content Safety、No-Go 例を独立軸化 |
| Product / A11y / Engineering | ISSUE-045用 inventory table、PR report、a11y/perf/実装可能性gateを反映 |

平均点で blocker を相殺しない。Privacy Trust、Content Safety、Accessibility、
Task Success の blocker は全体判定を Hold / No-Go にする。

## 検証

- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 評価証跡に子ども/親の氏名、画像 URL、storage_key、AI 生成本文を含めない
- AI 生成文の品質評価は本文そのものではなく、分類・違和感・再現条件だけを残す
- 実ユーザー画像を使う場合は人間承認済み QA 手順に限定する

## 依存関係

- ISSUE-043 で定義したデザイン組織・専門家ペルソナ・レビュー運用を前提にする

## 参考

- GitHub Issue #91
- `docs/design/design-evaluation-rubric.md`
- `Hana_PRD_v1.md` §13 UX設計
- `Hana_PRD_v1.md` §14 HEART評価
- `docs/release/mvp-release-readiness.md`
- `docs/api-driven-development/security-and-privacy.md`
