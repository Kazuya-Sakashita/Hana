---
id: ISSUE-043
title: Hana デザイン再構築の運営組織とサブエージェント体制を定義する
priority: P1
status: done
size: M
created_at: 2026-07-23
parent: DESIGN
github_issue: 90
requires_human_review:
  - design
  - privacy
---

## 目的 (Why)

Hana のアプリデザインを再構築するため、単発の画面改善ではなく、継続的にデザイン品質を判断・改善できる専任組織とサブエージェント運営体制を定義する。

Hana は子どもの写真・感情記録・AI 生成文を扱うため、単なる UI 見た目ではなく、安心感、責めない体験、記憶として残したくなる情緒、プライバシー信頼を含めて設計する。

## スコープ (What)

- Hana Design Organization の役割定義
  - Design Lead / Head of Design
  - Product Designer
  - UX Researcher
  - Visual / Brand Designer
  - Content Designer / UX Writer
  - Design System / DesignOps
  - Accessibility Reviewer
  - Privacy / Trust Reviewer
  - Engineering Design Reviewer
- Codex で運用する専門家サブエージェント体制の定義
- どの段階でどの専門家レビューを必須にするかを決める
- デザイン再構築 Issue 群の進め方を定義する

## やらないこと (Out of Scope)

- この Issue では画面実装をしない
- Figma / UI コードの大規模変更はしない
- 既存デザインの良し悪しを直感だけで決めない

## 影響範囲

| 領域         | 影響                                       |
| ------------ | ------------------------------------------ |
| OpenAPI      | なし                                       |
| 生成型       | なし                                       |
| アプリコード | なし                                       |
| ドキュメント | デザイン運営体制、レビュー体制、後続 Issue |
| 運用         | デザイン再構築時のサブエージェント編成     |

## 受け入れ条件 (Acceptance Criteria)

- [x] Hana のデザイン組織図が定義されている
- [x] 各ロールの責務、成果物、レビュー観点が明文化されている
- [x] Codex サブエージェントとして起動する専門家ペルソナと依頼テンプレートが定義されている
- [x] Design Review の入口条件・完了条件が定義されている
- [x] Privacy / Accessibility / Content / Brand / Product UX のレビューが抜けない運用になっている
- [x] 後続の ISSUE-044 / ISSUE-045 を進める前提条件が明確になっている
- [x] `docs/design/design-organization.md` が追加されている
- [x] `docs/design/design-review-playbook.md` が追加されている
- [x] `docs/design/subagent-prompt-templates.md` が追加されている
- [x] `pnpm pr:gate` が通る

## サブエージェント検討

3名の read-only サブエージェントで並行検討した。

| 観点                    | 反映内容                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| Head of Design          | 役割定義、phase gate、mandatory / optional の分離、anti-pattern を反映     |
| Privacy / Trust / A11y  | evidence policy、必須 privacy gate、accessibility gate、base prompt を反映 |
| DesignOps / Engineering | review ledger、Adopt / Defer / Reject、成果物配置、exit criteria を反映    |

## 検証

- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 子ども/親の氏名、画像 URL、storage_key、AI 生成本文をレビュー証跡に残さない
- デザイン評価では実データではなく、匿名化・架空データを使う
- AI 送信、写真表示、空状態、エラー文言は Privacy / Trust Reviewer の必須レビュー対象にする

## 依存関係

- この Issue が完了すると、ISSUE-044 (デザイン評価手法) に進める
- ISSUE-045 (現行デザイン棚卸し) は ISSUE-043 / ISSUE-044 の方針を前提にする

## 参考

- GitHub Issue #90
- `docs/design/design-organization.md`
- `docs/design/design-review-playbook.md`
- `docs/design/subagent-prompt-templates.md`
- `Hana_PRD_v1.md` §13 UX設計
- `Hana_PRD_v1.md` §14 HEART評価
- `docs/design/v0-prompt.md`
- `docs/api-driven-development/codex-automation-runbook.md`
- `AGENTS.md`
