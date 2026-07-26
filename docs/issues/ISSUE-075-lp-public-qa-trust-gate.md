---
id: ISSUE-075
title: LP 公開前 QA と trust human review gate
priority: P0
status: done
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 166
blocked_by: []
external_blockers: []
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
- [x] privacy / legal review 済みの trust copy だけが公開候補に残っている
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

2026-07-26 の human review copy 反映後に、再度 app mode QA を実行した。
`/lp` と `/privacy` は 390x844 / 430x932 / 768x1024 / 1280x900 で pass。
新しい問い合わせメールリンクは 44px tap target と visible focus を満たし、
Next DevTools の `<nextjs-portal>` は app 本体の interactive target から除外した。
公開連絡先 `privacy@hana.app` と公開前検証レビュー済み表現は許可しつつ、
それ以外のメール、画像 URL、`storage_key`、prompt、AI 生成本文、過剰 claim は evidence safety gate で引き続き拒否する。

## Human Review Result

- 2026-07-26: 現在の `/lp` と `/privacy` の文言を、公開前検証用のレビュー対象コピーとして進める判断を受領
- 2026-07-26: 現時点の copy は Privacy / Legal Human Review 済みとして扱ってよい判断を受領
- 2026-07-26: 案内停止・登録情報削除の連絡手段は問い合わせ用メールアドレス `privacy@hana.app` を表示する
- 2026-07-26: メール配信基盤のサービス名は公開前検証時点では明記せず、正式公開時点で必要に応じて追記する
- 2026-07-26: 「認証とアクセス制御が可能な管理環境」という表現は公開前検証段階の説明として承認済み

## Remaining Release Note

- 正式公開前にサービス内容や運用方法が変更された場合のみ、最終 privacy / legal review を再実施する

## Resolved Dependencies

- `ISSUE-072`: LP waitlist CTA / API / public route
- `ISSUE-073`: LP Before / After value proof
- `ISSUE-074`: LP Hero keepsake composition

## セキュリティ・プライバシー考慮

- Trust blocker は visual score で相殺しない
- 未確認の vendor retention / training / deletion claim は公開候補から除外する

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、修正後に Round 2 再レビューを行った。

| round | reviewer                     | verdict                    | notes                                                                  |
| ----- | ---------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| 1     | Accessibility / Browser QA   | HOLD                       | tap target、no-JS fallback、QA test contradiction、evidence claim 不足 |
| 1     | Privacy / Trust              | HOLD                       | public traffic は privacy/legal 未承認。AI/削除/配信運用 claim は保留  |
| 1     | Release QA / Performance     | HOLD                       | 実ブラウザ QA、LCP/image payload、env/bot residual evidence が不足     |
| 2     | Accessibility / Browser QA   | GO                         | 390/430/768/1280 app mode、no-JS、tap target、focus、overflow pass     |
| 2     | Privacy / Trust              | GO for merge / HOLD launch | machine QA evidence PR は merge 可。privacy/legal は launch blocker    |
| 2     | Release QA / Performance     | GO for merge / HOLD launch | `pr:gate` 組込み、static route、image payload、LCP evidence を確認     |
| 3     | Privacy / Legal Human        | GO                         | 公開前検証 copy をレビュー済みとして扱い、正式公開前の変更時のみ再確認 |
| 4     | Privacy / Legal Trust Copy   | HOLD → GO                  | `/privacy` の draft / reviewed 表現の矛盾を修正後、過剰 claim なし     |
| 4     | Public UX / Conversion Copy  | HOLD → GO                  | `/privacy` の review 状態表現を統一し、連絡先表示と tone を確認        |
| 4     | Release QA / Evidence Safety | HOLD → GO                  | `current-lp-evaluation` の古い条件付き Go と画像証跡要求を修正         |
| 5     | App Mode QA Follow-up        | GO                         | 連絡先 mailto の tap target / focus と evidence safety script を再確認 |
| 6     | Privacy / Legal Trust Copy   | GO                         | 公開連絡先、配信サービス非明記、管理環境表現、過剰 claim なしを確認    |
| 6     | Public UX / Accessibility    | GO                         | mailto link の理解しやすさ、form 非追加、tap target、focus を確認      |
| 6     | Release QA / Evidence Safety | GO                         | status sync、app-mode QA 証跡、QA script の許可範囲を確認              |

## 参考

- `docs/design/ai-consent-privacy-evidence.md`
- `docs/design/settings-trust-center-qa.md`
- `docs/design/current-lp-evaluation.md`
