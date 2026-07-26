---
id: ISSUE-086
title: Public LP / Privacy visual QA gate を拡張する
priority: P1
status: done
size: M
created_at: 2026-07-26
parent: PUBLIC-SURFACE-WARMTH
github_issue: 192
blocked_by:
  - ISSUE-084
  - ISSUE-085
external_blockers: []
requires_human_review:
  - design
  - accessibility
  - privacy
  - release
---

## 目的 (Why)

`/lp` と `/privacy` は公開前検証の入口であり、コード上の radius や copy だけでは「冷たく見える」回帰を検知しづらい。`/lp` だけでなく `/privacy` も public trust surface として QA 対象に入れ、Hana らしい温度感、tap target、focus、contrast、evidence safety を継続的に確認できる gate を追加する。

## スコープ (What)

- 既存 LP public QA の対象に `/privacy` の soft selector / trust summary / detail / footer を追加する
- `/lp` の form-before trust bridge と public surface 語彙を contract test 化する
- 390 / 430 / 768 / 1280px の app mode で `/lp` と `/privacy` を確認する
- “visual improvement does not clear privacy/legal blocker” をテストまたは Issue 文面で固定する
- screenshot / evidence policy に従い、実写真やメールを残さない

## やらないこと (Out of Scope)

- `ISSUE-084` / `ISSUE-085` の UI 実装
- privacy / legal review の完了扱い
- 本番デプロイ
- API / DB / Auth / Storage / OpenAPI の変更

## 受け入れ条件 (Acceptance Criteria)

- [x] `/privacy` が QA target として `data-public-privacy` などで識別できる
- [x] `/lp` と `/privacy` の public surface selector が contract test で確認されている
- [x] 390 / 430 / 768 / 1280px で横スクロール、重なり、tap target、focus-visible、reduced motion を確認している
- [x] visual 改善が `ISSUE-075` の privacy / legal blocker を解除しないことが固定されている
- [x] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## 検証

- `pnpm exec vitest run tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts`
- `pnpm qa:issue075:lp-public -- --mode=contract`
- `CODEX_RUNTIME_NODE_MODULES=<bundled-node-modules> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm qa:issue075:lp-public -- --mode=app`
- `pnpm pr:gate`

### 2026-07-26 実装結果

- `/privacy` に `data-public-privacy-summary` / `data-public-privacy-details` / `data-public-privacy-footer` を追加し、trust summary / detail / footer を QA target 化した
- `/lp` の keepsake journey / trust bridge / waitlist purpose を app mode の必須 selector に追加した
- JavaScript 無効時に Next の streamed payload が hidden のまま残るため、`/lp/loading.tsx` に `data-public-lp-fallback="no-js-shell"` の visible fallback を追加した
- Next dev server の DevTools button は app 本体ではないため、interactive target から除外する selector を QA output に明示した
- `ISSUE-075` は privacy / legal review 待ちの blocked のまま維持した

### 2026-07-26 検証結果

- `pnpm exec vitest run tests/unit/app/lp-public-qa-trust-gate.test.ts tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts` pass (5 files / 25 tests)
- `pnpm qa:issue075:lp-public -- --mode=contract` pass
- `pnpm build:ci` pass (`/lp` と `/privacy` は static route)
- `CODEX_RUNTIME_NODE_MODULES=/Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm qa:issue075:lp-public -- --mode=app` pass

## 専門レビュー観点

| reviewer        | framework             | 確認観点                                                                 |
| --------------- | --------------------- | ------------------------------------------------------------------------ |
| Frontend / A11y | browser QA            | app mode で実表示の硬さ、overflow、focus、tap target を検知できるか      |
| Visual Systems  | public surface parity | `/lp` と `/privacy` の温度感が Home の Quiet Heirloom と乖離していないか |
| Privacy Trust   | evidence safety       | QA 証跡と PR body に機微情報や未承認 claim が残らないか                  |
