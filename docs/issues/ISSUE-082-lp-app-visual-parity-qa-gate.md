---
id: ISSUE-082
title: LP-App visual parity QA gate を整える
priority: P1
status: review
size: M
created_at: 2026-07-25
parent: LP-APP-DESIGN-PARITY
github_issue: 183
blocked_by:
  - ISSUE-076
  - ISSUE-077
  - ISSUE-078
  - ISSUE-079
  - ISSUE-080
  - ISSUE-081
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

LP と本体アプリの見た目が同じ Hana に見えることを、実装後も継続確認できるようにする。

`ISSUE-076` から `ISSUE-081` で、LP / 参照画像の優しい質感を本体アプリに戻す実装は進んだ。
ただし、今後の変更で `photo mat + paper slip + sage pill + quiet icon` が画面ごとに崩れても、
CI で検知する入口はまだ弱い。

## スコープ (What)

- LP-App visual parity QA の正本を追加する
- screenshot matrix、contrast、tap target、evidence safety、trust copy の確認軸を明文化する
- CI で実行できる read-only contract script を追加する
- `pnpm pr:gate` に `ISSUE-082` の gate を組み込む
- merge 済み `ISSUE-081` の local status と Issue index を `done` へ同期する

## やらないこと (Out of Scope)

- 新しい LP デザインの作成
- screenshot artifact の保存
- app-backed Playwright QA の追加
- API / DB / Auth / Storage / OpenAPI の変更
- privacy / legal claim の追加

## 影響範囲

- `docs/design/lp-app-visual-parity-qa.md`
- `docs/design/product-design-qa-v2.md`
- `docs/design/README.md`
- `scripts/qa/issue-082-lp-app-visual-parity-contract.cjs`
- `tests/unit/app/lp-app-visual-parity-qa-gate.test.ts`
- `package.json`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] `docs/design/lp-app-visual-parity-qa.md` に QA gate、screenshot matrix、evidence policy が記録されている
- [x] `pnpm qa:issue082:lp-app-visual-parity -- --mode=contract` が read-only で通る
- [x] `pnpm pr:gate` に `ISSUE-082` の gate が含まれている
- [x] Home / Record / Album / Memory Detail / Sign-in / Onboarding / Settings の bridge contract が検査される
- [x] 実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを QA 証跡に残さない方針が明記されている
- [x] 専門サブエージェント 3 名でレビューし、Hold があれば最大 3 回まで修正・再レビューする

## 実装メモ

- GitHub Issue `#183` を作成し、ローカル正本を追加した
- `docs/design/lp-app-visual-parity-qa.md` に Gate Policy、Screenshot Matrix、CI Contract、Evaluation Framework、Evidence Policy を追加した
- `scripts/qa/issue-082-lp-app-visual-parity-contract.cjs` を追加し、LP artifact、主要 app surface、design docs、unsafe trust claim を read-only で検査するようにした
- round 1 の Product Design review で、token / CTA / surface / icon の検査が宣言寄りで弱いという Hold が出たため、`globals.css`、`Button`、`PhotoMat` / `PaperSlip`、`QuietIcon` / `QuietIconButton` の実体契約を `visual_system_contracts` として追加した
- `pnpm pr:gate` に `pnpm qa:issue082:lp-app-visual-parity -- --mode=contract` を組み込んだ
- merge 済み `ISSUE-081` の local status と index を `done` へ同期した

## セキュリティ・プライバシー考慮

- QA script は read-only contract とし、screenshot、manifest、accessibility snapshot、evidence file を保存しない
- active UI source に vendor retention、ZDR、完全削除、復元可能、Store CTA、未実装 OAuth を断定する copy が増えていないことを検査する
- 出力 JSON は file id、route id、matrix id、check 名だけに限定し、本文・画像 URL・メール・AI 生成本文を保存しない

## 検証

- [x] `pnpm exec vitest tests/unit/app/lp-app-visual-parity-qa-gate.test.ts tests/unit/app/product-design-qa-v2.test.ts tests/unit/app/album-memory-private-shelf-polish.test.ts --run`
- [x] `pnpm qa:issue082:lp-app-visual-parity -- --mode=contract`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                       | verdict | notes                                                                                     |
| ----- | ------------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| 1     | Product Design / LP-App Parity | HOLD    | token / CTA / surface / icon が宣言寄りで弱い。`visual_system_contracts` で実体検査を追加 |
| 1     | Visual System / Accessibility  | GO      | read-only contract、PR gate 連携、source contract、matrix は ISSUE-082 の範囲で成立       |
| 1     | Privacy / Evidence Safety      | GO      | PII / image URL / `storage_key` / prompt / AI 生成本文、過剰 trust claim の抑制は問題なし |
| 2     | Product Design / LP-App Parity | HOLD    | 設計契約は解消。Issue status を `review` に進めたため、test の `in_progress` 固定のみ指摘 |
| 3     | Product Design / LP-App Parity | GO      | `in_progress\|review\|done` 許容へ修正済み。focused test と contract pass                 |

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/issues/ISSUE-081-album-memory-private-shelf-polish.md`
