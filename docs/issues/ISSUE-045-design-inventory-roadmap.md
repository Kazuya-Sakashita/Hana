---
id: ISSUE-045
title: Hana アプリ現行デザインを棚卸しして再構築ロードマップを作る
priority: P1
status: blocked
size: M
created_at: 2026-07-23
parent: DESIGN
github_issue: 92
blocked_by:
  - ISSUE-044
requires_human_review:
  - design
  - privacy
---

## 目的 (Why)

現行の Hana アプリデザインを、プロダクト思想・UX原則・ブランド・アクセシビリティ・プライバシー信頼の観点から棚卸しし、再構築ロードマップを作る。

この Issue は、いきなり画面を作り直すためではなく、どの体験を、どの順番で、どの評価基準で直すべきかを決めるための設計 Issue とする。

## 対象画面 / フロー

- `/sign-in`
- `/onboarding`
- `/record`
- AI 生成中 / 生成失敗 / 保存完了
- `/album`
- `/memory/[memoryId]`
- `/settings`
- empty state / loading / error state
- 写真表示、AI同意、削除、キャンセル、お気に入り

## スコープ (What)

- 現行 UI のスクリーン inventory を作る
- `Hana_PRD_v1.md` §13 UX設計とのズレを洗い出す
- `docs/design/v0-prompt.md` の思想と現行実装の差分を整理する
- 再構築対象を P0 / P1 / P2 に分類する
- デザイン再構築を複数 Issue に分割する
- 実装前に必要な Figma / Design System / Design Review の成果物を定義する

## 評価観点

- 30秒で記録できるか
- 責めない・急かさない・罪悪感を与えないか
- 写真が「記録」ではなく「記憶」に変わる感覚があるか
- AI が主役になりすぎていないか
- 子どもの写真を預ける不安を増やしていないか
- 空状態・失敗状態が優しいか
- mobile first で片手操作しやすいか
- typography / spacing / color / motion が Hana らしいか
- accessibility と performance を損ねていないか

## やらないこと (Out of Scope)

- この Issue では UI 実装をしない
- 実データ、子どもの写真、AI生成本文をレビュー証跡に貼らない
- 全画面を一つの巨大 PR で直さない

## 影響範囲

| 領域         | 影響                                        |
| ------------ | ------------------------------------------- |
| OpenAPI      | なし                                        |
| 生成型       | なし                                        |
| アプリコード | なし                                        |
| ドキュメント | 現行デザイン inventory、再構築ロードマップ  |
| 後続 Issue   | 画面・フロー単位のデザイン再構築 Issue 追加 |

## 受け入れ条件 (Acceptance Criteria)

- [ ] 現行画面 inventory がある
- [ ] 画面ごとの課題・強み・リスクが整理されている
- [ ] Hana Design Evaluation Rubric に基づく初回評価がある
- [ ] 再構築ロードマップが P0 / P1 / P2 に分かれている
- [ ] 後続 Issue 候補が半日〜2日粒度で分割されている
- [ ] サブエージェント組織でレビューする観点と順番が定義されている
- [ ] 実装前に必要なデザイン成果物が明確になっている

## セキュリティ・プライバシー考慮

- スクリーンショットを使う場合は架空データまたは匿名化データのみ
- 子ども/親の氏名、画像 URL、storage_key、AI 生成本文は記録しない
- Privacy / Trust Reviewer のレビューを必須にする

## 依存関係

- ISSUE-043: デザイン組織とサブエージェント体制
- ISSUE-044: Hana Design Evaluation Rubric

## 参考

- GitHub Issue #92
- `Hana_PRD_v1.md` §13 UX設計
- `Hana_PRD_v1.md` §14 HEART評価
- `docs/design/v0-prompt.md`
- `docs/issues/ISSUE-006c-design-system.md`
- `docs/issues/ISSUE-012-home.md`
- `docs/issues/ISSUE-013-memory-detail.md`
- `docs/issues/ISSUE-014a-record-cancel.md`
