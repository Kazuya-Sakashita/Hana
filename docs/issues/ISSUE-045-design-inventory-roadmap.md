---
id: ISSUE-045
title: Hana アプリ現行デザインを棚卸しして再構築ロードマップを作る
priority: P1
status: review
size: M
created_at: 2026-07-23
parent: DESIGN
github_issue: 92
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

- [x] 現行画面 inventory がある
- [x] 画面ごとの課題・強み・リスクが整理されている
- [x] Hana Design Evaluation Rubric に基づく初回評価がある
- [x] 再構築ロードマップが P0 / P1 / P2 に分かれている
- [x] 後続 Issue 候補が半日〜2日粒度で分割されている
- [x] サブエージェント組織でレビューする観点と順番が定義されている
- [x] 実装前に必要なデザイン成果物が明確になっている

## 成果物

- `docs/design/design-inventory-roadmap.md`
- `docs/design/README.md` への参照追加

## サブエージェント検討

3名の read-only サブエージェントで並行検討した。

| 観点                        | 主な指摘                                                                             | 反映先                  |
| --------------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| Product UX / Task Success   | `/record` の認知負荷、保存成功の達成感、settings trust surface、album 多件数証跡     | P0/P1 roadmap           |
| Privacy / Trust / Content   | AI vendor claim、delete restore copy、synthetic evidence、`storage_key` 証跡管理     | P0 gate / evidence rule |
| Visual / A11y / Engineering | 低コントラスト token、dialog focus、zoom lock、photo alt policy、RSC/Suspense の強み | scorecard / P0 roadmap  |

## 初回評価

- 総合判定: Hold
- No-Go 露出: 棚卸し上は見つけていない
- Hold 理由:
  - `/record` の 30秒記録証跡がない
  - AI 同意 copy の vendor evidence が未整理
  - delete copy と restore flow の整合が未確認
  - contrast / dialog focus / zoom / photo alt policy が未解決

詳細は `docs/design/design-inventory-roadmap.md` を参照。

## 検証

- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- スクリーンショットを使う場合は架空データまたは匿名化データのみ
- 子ども/親の氏名、画像 URL、storage_key、AI 生成本文は記録しない
- Privacy / Trust Reviewer のレビューを必須にする

## 依存関係

- ISSUE-043: デザイン組織とサブエージェント体制
- ISSUE-044: Hana Design Evaluation Rubric（完了済み）

## 参考

- GitHub Issue #92
- `Hana_PRD_v1.md` §13 UX設計
- `Hana_PRD_v1.md` §14 HEART評価
- `docs/design/v0-prompt.md`
- `docs/issues/ISSUE-006c-design-system.md`
- `docs/issues/ISSUE-012-home.md`
- `docs/issues/ISSUE-013-memory-detail.md`
- `docs/issues/ISSUE-014a-record-cancel.md`
