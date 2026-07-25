---
id: ISSUE-083
title: LP の画像とカードの角丸を Quiet Heirloom に寄せる
priority: P1
status: done
size: S
created_at: 2026-07-26
parent: LP-PUBLIC-READINESS
github_issue: 188
blocked_by: []
external_blockers: []
requires_human_review:
  - design
---

## 目的 (Why)

`/lp` の画像やカードの長方形感が強く、参照LPや Hana の Quiet Heirloom らしいやわらかさより冷たい印象に見える。公開前待機リストLPとして、写真台紙・紙片・フォームが同じ保存箱の質感に見えるよう、角丸と境界線の扱いを整える。

## スコープ (What)

- `/lp` の hero keepsake preview の外枠、photo mat、画像、caption の角丸を一段やわらかくする
- Before / After、Trust、待機リストフォームの surface に同じ LP soft corner 語彙を適用する
- 入力欄、consent、privacy note も冷たい矩形に見えないよう調整する
- LP専用の静的テストで角丸語彙と privacy blocker の維持を確認する

## やらないこと (Out of Scope)

- trust copy の公開判断
- privacy / legal review の完了扱い
- API / DB / OpenAPI の変更
- 本番デプロイ

## 受け入れ条件 (Acceptance Criteria)

- [x] Hero の画像と外枠が `soft keepsake` として LP 専用 radius 語彙を使っている
- [x] Before / After と Trust のカードが同じ角丸・境界線・浅い影の語彙で揃っている
- [x] 待機リストフォームが紙片 surface として見え、入力欄や同意欄が硬い矩形に戻らない
- [x] 44px 以上の tap target、focus-visible、既存 trust blocker を壊していない
- [x] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## 検証

- `pnpm exec vitest run tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/prelaunch-lp-route.test.ts`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build:ci`
- `pnpm pr:gate`
- `CODEX_RUNTIME_NODE_MODULES=<bundled-node-modules> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm qa:issue075:lp-public -- --mode=app`
- `/lp` 390px screenshot を目視確認し、Round 1 の過大 radius を抑えた

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、Round 1 の HOLD 指摘を修正後、Round 2 再レビューを行った。

| round | reviewer      | verdict                    | notes                                                                 |
| ----- | ------------- | -------------------------- | --------------------------------------------------------------------- |
| 1     | Visual Design | HOLD                       | LP soft radius が過大で、ぷっくりした UI card に寄る                  |
| 1     | Frontend QA   | HOLD                       | `format:check` fail。form の `lp-soft-frame + shadow-none` に順序依存 |
| 1     | Product Trust | GO for merge / HOLD launch | visual softening は merge 可。`ISSUE-075` の公開 blocker は維持       |
| 2     | Visual Design | GO                         | radius を canon 近くに戻し、inner card shadow を削除                  |
| 2     | Frontend QA   | GO                         | format / lint / typecheck / focused tests / contract QA pass          |
| 2     | Product Trust | GO for merge / HOLD launch | trust copy / privacy legal blocker は未解除のまま                     |

## 実装メモ

- `lp-soft-frame` は外側 keepsake frame のみに使い、丸みと影を控えめにした
- `lp-soft-card` は paper-slip より少しだけ丸くし、影なしの hairline surface とした
- `lp-soft-form` を分け、待機リストフォームは radius-only にした
- `lp-soft-photo-inner` は LP hero の synthetic preview に限り 14px 相当へ調整した
- `ISSUE-075` は引き続き `blocked`。本 Issue は公開判断を含まない
