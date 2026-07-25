---
id: ISSUE-073
title: LP Before / After の価値証拠を強化
priority: P0
status: review
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 164
blocked_by:
  - ISSUE-071
requires_human_review:
  - design
  - privacy
---

## 目的 (Why)

Hana の差別化である「写真のみ → 写真 + ことば」の価値を、LP 上で一目で伝わる証拠にする。

現在の prototype は synthetic な短文例を置いたが、PRD が求める Before / After の説得力としてはまだ弱い。

## スコープ (What)

- 実データではない日常写真風の safe asset を用意する
- 「写真だけ」と「Hana で残すと」の差分を、文章量を増やしすぎずに示す
- AI 生成本文ではなく、人間レビュー済みの synthetic 例として扱う
- Product UX / Brand / Privacy の観点で再レビューする

## やらないこと (Out of Scope)

- 実ユーザー写真の利用
- 実名、誕生日、メール、位置情報を含む例示
- AI 生成本文の全文を証跡として残すこと

## 受け入れ条件 (Acceptance Criteria)

- [x] Before / After が 3 秒で「何が変わるか」を伝える
- [x] 写真のみ、写真 + title、写真 + 短い本文の差分が分かる
- [x] synthetic asset / copy であることが証跡上明確
- [x] 実写真、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- [x] Product UX / Brand / Privacy の read-only review で P0 blocker がない

## 実装メモ

- `docs/design/artifacts/current-lp/hana-before-after-safe-still-life.svg` を synthetic safe asset として追加した
- LP の Before / After を `写真のみ → 写真 + title → 写真 + 短い本文` の3段 proof に変更した
- After copy は人間レビュー済み synthetic 例として扱い、AI 生成本文や実ユーザー情報ではないことを LP 内に明記した
- `docs/design/current-lp-evaluation.md` の `LP-P0-02` を ISSUE-073 対応済みに更新した
- merge 済み `ISSUE-071` / `ISSUE-082` の local status と index を `done` へ同期する
- Brand / Visual review の HOLD を受け、紙ガイド線を削除し、布 / 靴下の質感線と影を低コントラスト化した。再開後の追加レビューで GO を確認した

## Blocked by

- `ISSUE-071`

## セキュリティ・プライバシー考慮

- サンプルは synthetic のみ
- AI 生成品質の評価が必要な場合も本文全文ではなく、分類と score で残す
- LP artifact に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## 検証

- [x] `pnpm exec vitest tests/unit/app/lp-before-after-proof.test.ts tests/unit/app/lp-static-prototype-review.test.ts --run`
- [x] `pnpm format:check`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [ ] `pnpm pr:gate`
- [ ] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                  | verdict | notes                                                                                          |
| ----- | ------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 1     | Product UX / Value Proof  | GO      | 3秒で価値差分が伝わり、`写真のみ → 写真 + title → 写真 + 短い本文` の段階差も読める            |
| 1     | Privacy / Evidence Safety | GO      | local SVG、実写真 / 外部画像 URL / signed URL / `storage_key` / prompt / AI 生成本文の混入なし |
| 1     | Brand / Visual Direction  | HOLD    | SVG が写真風ではなくフラットな図解に見える。紙目、影、非対称配置を追加                         |
| 2     | Brand / Visual Direction  | HOLD    | 影がテクスチャ線に強く乗り、黒い斜線が目立つ。影をベース形状だけに分離                         |
| 3     | Brand / Visual Direction  | HOLD    | 紙ガイド線と布 / 靴下の質感線がまだ強い。線をさらに削る方針へ切り替え                          |
| 4     | Brand / Visual Direction  | GO      | black-band / 強すぎる texture 問題は解消。Quiet Heirloom と synthetic visual 表記に整合        |

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`
