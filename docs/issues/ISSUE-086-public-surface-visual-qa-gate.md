---
id: ISSUE-086
title: Public LP / Privacy visual QA gate を拡張する
priority: P1
status: todo
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

- [ ] `/privacy` が QA target として `data-public-privacy` などで識別できる
- [ ] `/lp` と `/privacy` の public surface selector が contract test で確認されている
- [ ] 390 / 430 / 768 / 1280px で横スクロール、重なり、tap target、focus-visible、reduced motion を確認している
- [ ] visual 改善が `ISSUE-075` の privacy / legal blocker を解除しないことが固定されている
- [ ] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## 検証

- `pnpm exec vitest run tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts`
- `pnpm qa:issue075:lp-public -- --mode=contract`
- `CODEX_RUNTIME_NODE_MODULES=<bundled-node-modules> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm qa:issue075:lp-public -- --mode=app`
- `pnpm pr:gate`

## 専門レビュー観点

| reviewer        | framework             | 確認観点                                                                 |
| --------------- | --------------------- | ------------------------------------------------------------------------ |
| Frontend / A11y | browser QA            | app mode で実表示の硬さ、overflow、focus、tap target を検知できるか      |
| Visual Systems  | public surface parity | `/lp` と `/privacy` の温度感が Home の Quiet Heirloom と乖離していないか |
| Privacy Trust   | evidence safety       | QA 証跡と PR body に機微情報や未承認 claim が残らないか                  |
