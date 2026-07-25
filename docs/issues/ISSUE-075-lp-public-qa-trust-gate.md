---
id: ISSUE-075
title: LP 公開前 QA と trust human review gate
priority: P0
status: blocked
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 166
blocked_by: []
external_blockers:
  - 公開 copy の privacy / legal review
requires_human_review:
  - privacy
  - legal
  - accessibility
  - release
---

## 目的 (Why)

LP を公開候補にする前に、実ブラウザ QA と trust copy の人間レビューを通し、子どもの写真・AI 利用に関する不安や誤解を増やさない状態にする。

## スコープ (What)

- 390 / 430 / 768 / 1280px の実ブラウザ QA
- 横スクロール、重なり、折返し、tap target、focus order、contrast、reduced motion の確認
- image payload と LCP 目安の確認
- AI 同意、送るもの / 送らないもの、保持、学習、削除保証に関する公開 copy の human review
- 公開用 evidence に実データや機微情報が残らないことの確認

## やらないこと (Out of Scope)

- Store 申請
- 本番デプロイ
- 事前登録データの運用開始

## 受け入れ条件 (Acceptance Criteria)

- [x] 390 / 430 / 768 / 1280px の QA evidence がある
- [x] 横スクロール、重なり、tap target 不足がない
- [x] focus-visible、reduced motion、viewport zoom が確認されている
- [x] image payload が公開 LP として許容できる
- [ ] privacy / legal review 済みの trust copy だけが公開候補に残っている
- [x] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## Machine QA Evidence

- `pnpm qa:issue075:lp-public -- --mode=contract`
- `pnpm exec vitest run tests/unit/app/lp-public-qa-trust-gate.test.ts tests/unit/app/prelaunch-lp-route.test.ts tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/accessibility-baseline.test.ts tests/unit/app/bottom-nav-action-icon-alignment.test.ts`
- `pnpm build:ci`
- `CODEX_RUNTIME_NODE_MODULES=<node_modules-with-playwright> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm qa:issue075:lp-public -- --mode=app`

実ブラウザ app mode では `/lp` と `/privacy` を 390x844 / 430x932 / 768x1024 / 1280x900 で確認した。
`/lp` は waitlist submit を route mock で 202 にし、no-JS では form を非表示にして fallback notice を表示した。
LP synthetic SVG は static asset 4,388 bytes、transfer 1,883 bytes、encoded body 1,583 bytes。
LCP は `/lp` で 390px 80ms、430px 44ms、768px 60ms、1280px 52ms。

## Blocked by

- 公開 copy の privacy / legal review

## Resolved Dependencies

- `ISSUE-072`: LP waitlist CTA / API / public route
- `ISSUE-073`: LP Before / After value proof
- `ISSUE-074`: LP Hero keepsake composition

## セキュリティ・プライバシー考慮

- Trust blocker は visual score で相殺しない
- 未確認の vendor retention / training / deletion claim は公開候補から除外する

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、修正後に Round 2 再レビューを行った。

| round | reviewer                   | verdict                    | notes                                                                  |
| ----- | -------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| 1     | Accessibility / Browser QA | HOLD                       | tap target、no-JS fallback、QA test contradiction、evidence claim 不足 |
| 1     | Privacy / Trust            | HOLD                       | public traffic は privacy/legal 未承認。AI/削除/配信運用 claim は保留  |
| 1     | Release QA / Performance   | HOLD                       | 実ブラウザ QA、LCP/image payload、env/bot residual evidence が不足     |
| 2     | Accessibility / Browser QA | GO                         | 390/430/768/1280 app mode、no-JS、tap target、focus、overflow pass     |
| 2     | Privacy / Trust            | GO for merge / HOLD launch | machine QA evidence PR は merge 可。privacy/legal は launch blocker    |
| 2     | Release QA / Performance   | GO for merge / HOLD launch | `pr:gate` 組込み、static route、image payload、LCP evidence を確認     |

## 参考

- `docs/design/ai-consent-privacy-evidence.md`
- `docs/design/settings-trust-center-qa.md`
- `docs/design/current-lp-evaluation.md`
