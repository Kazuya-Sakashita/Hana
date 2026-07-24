---
id: ISSUE-066
title: Quiet Heirloom refinement 設計契約
priority: P0
status: done
size: S
created_at: 2026-07-24
parent: QUIET-HEIRLOOM-REFINEMENT
github_issue: 152
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

添付コンセプト画像と現行 Hana の差分をもとに、Quiet Heirloom の精度上げに必要な設計契約を固定する。

Hana は「写真 1 枚から、AI が子どもとの記憶を物語にする」育児記録アプリであり、単に淡い UI にするのではなく、
写真、紙、余白、sage の記録導線、sakura の小さな印を通じて、私的なアルバムとして信頼できる体験に寄せる。

## スコープ (What)

- `sage = 記録・保存・完了`, `sakura = 装飾・しるし・小さな感情アクセント` の意味を明文化する
- radius / shadow / photo mat / paper surface / pressed flower ornament の使用基準を定義する
- `docs/design/product-design-qa-v2.md` に refinement QA 観点を追加する
- 後続の `ISSUE-067` から `ISSUE-070` を、依存関係つきの実装スライスとして登録する
- OpenAPI / DB / 認証 / Storage の変更が不要であることを明記する

## やらないこと (Out of Scope)

- UI コンポーネントの実装変更
- 画像生成や実写真素材の追加
- OpenAPI / DB / 認証 / Storage の変更
- AI 同意、削除、復元、保持期間などの active UI claim を増やすこと

## 影響範囲

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/issues/`
- design contract を検証する unit test

## 受け入れ条件 (Acceptance Criteria)

- [x] Quiet Heirloom の refinement 方針として `sage = 記録・保存・完了`, `sakura = 装飾・しるし・小さな感情アクセント` が明文化されている
- [x] radius / shadow / photo mat / paper surface / pressed flower ornament の使用基準が、実装可能な粒度で定義されている
- [x] `docs/design/product-design-qa-v2.md` に、写真台紙、余白、私的アルバム感、下部記録導線、証跡禁止対象の追加 QA 観点が入っている
- [x] 後続 Issue が `ISSUE-067` 以降として分割され、依存関係が追える
- [x] OpenAPI / DB / 認証 / Storage の変更が不要であることが明記されている
- [x] Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## セキュリティ・プライバシー考慮

- この Issue は docs / test のみで、ユーザーデータや画像データを扱わない
- 証跡には実写真、production data、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さない
- AI / retention / training-use / restore の active UI claim は、既存 privacy evidence と human review gate を優先する

## 検証

- `pnpm exec vitest run tests/unit/app/quiet-heirloom-refinement-contract.test.ts tests/unit/app/product-design-qa-v2.test.ts`
- `pnpm qa:issue064:design-dom-smoke -- --mode=contract`

## 参考

- `docs/design/concepts/hana-quiet-heirloom-concept-2026-07-23.png`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `Hana_PRD_v1.md`
