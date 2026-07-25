---
id: ISSUE-080
title: Sign-in / Onboarding / Settings trust bridge を整える
priority: P1
status: done
size: M
created_at: 2026-07-25
parent: LP-APP-DESIGN-PARITY
github_issue: 179
blocked_by:
  - ISSUE-076
  - ISSUE-077
  - ISSUE-078
  - ISSUE-079
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

LP で固めた「静かな heirloom / やさしい紙面 / 安全側の trust copy」を、アプリ入口の
Sign-in / Onboarding / Settings に接続する。

公開前検証フェーズでは、未確認の OAuth 予定、Store 予定、削除保証、vendor 保持保証を
active UI に出さない。現在の実装で約束できる範囲だけを、丸み、余白、落ち着いた色、
紙面トーンで伝える。

## スコープ (What)

- Sign-in の generic card 感を減らし、LP と同じ紙面・余白・丸みの入口へ寄せる
- Sign-in から未確認の Apple / Store / 近日対応 claim を消す
- Sign-in に、サインインだけでは写真や記録が作成されないこと、AI 利用前に確認が入ることを表示する
- Onboarding で、呼び名と生年月日の用途を登録前に説明し、AI 送信や正式な記録作成と混同させない
- Settings で、現在できることの概要と AI / data boundary の詳細を分けて読めるようにする
- 静的 contract test と Issue index を更新する

## やらないこと (Out of Scope)

- OAuth provider の追加・変更
- Supabase/Auth/Storage/DB/API/OpenAPI の変更
- 正式リリース後 CTA、Store 導線、退会/export/家族共有/Hana Plus の実装
- 新しい法務・プライバシー保証の追加
- 生成画像内の copy / trust claim の転記

## 影響範囲

- `src/app/sign-in/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/record/page.tsx`（AI consent copy の retention claim 整合のみ）
- `src/lib/ui/settings-trust-center-copy.ts`
- LP-App visual parity / trust bridge 系の静的 contract test
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] Sign-in が generic card ではなく、LP と同じ紙面・丸み・静かな余白の入口として見える
- [x] Sign-in から未確認の Apple / Store / 近日対応 claim が消えている
- [x] Sign-in に、サインインだけでは写真や記録が作成されないこと、AI 利用前に確認が入ることが安全側に表示されている
- [x] Onboarding で、呼び名・生年月日の用途が登録前に分かり、AI 送信や正式な記録作成と混同しない
- [x] Settings で、現在できることの概要と AI / data boundary の詳細が分かれて読める
- [x] 既存の privacy evidence と矛盾する copy を増やさない
- [x] Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 実装メモ

- Sign-in を `Card` から `FocusedShell` + `StatePanel` へ寄せ、紙面 tone、丸み、下部 CTA を揃えた
- Sign-in の Apple 近日対応 copy を削除し、サインインだけでは写真や記録を作成しないこと、AI 利用前に確認することを表示した
- Sign-in / Onboarding の trust bridge を `section` + `aria-labelledby` + `sr-only` heading + `ul/li` にし、視覚だけでなく意味構造でも読めるようにした
- Onboarding に、呼び名・うまれたひの用途と、登録だけでは写真や記録が作られないことを追加した
- `TrustSection` に quiet lucide icon を受け取れる API を追加し、Settings の概要 / AI 境界 / data 境界 / future 境界を視覚的に分けた
- `TrustSection` / `DataRow` に `min-w-0` と `break-words` を入れ、長い呼び名や email で横 overflow しにくくした
- Settings と Record の AI consent copy から vendor retention 期間の断定を消し、商用 API 条件と Hana のプライバシーレビューに沿う安全側表現へ揃えた
- merge 済み `ISSUE-079` の local status と stale assertion を `done` へ同期した

## セキュリティ・プライバシー考慮

- 画面構造と copy の変更であり、Auth / Storage / DB / API / OpenAPI には触れない
- AI に送るもの / 送らないものは `docs/design/ai-consent-privacy-evidence.md` の active UI rules と矛盾させない
- 未確認の vendor retention / ZDR / 完全削除 / 復元可能 / Store 公開予定 / OAuth 予定を断定しない
- PR body、Issue、test fixture に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 検証

- [x] `pnpm exec vitest tests/unit/app/signin-onboarding-settings-trust-bridge.test.ts tests/unit/app/onboarding-first-memory-bridge.test.ts tests/unit/app/settings-trust-center.test.ts tests/unit/app/lp-app-visual-grammar.test.ts tests/unit/app/record-bottom-sheet-flow.test.ts tests/unit/app/ai-consent-privacy-evidence.test.ts tests/unit/app/product-experience-v2-contract.test.ts tests/unit/app/record-one-decision-sheet-refinement.test.ts tests/unit/app/bottom-nav-action-icon-alignment.test.ts --run`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                      | verdict | notes                                                                                     |
| ----- | ----------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| 1     | Product UX / Entry Flow       | HOLD    | Settings の vendor retention 期間断定と Sign-in の作り手目線 copy を指摘。修正済み        |
| 1     | Visual System / Accessibility | HOLD    | trust bridge の semantic section 化と長い名前 / email の overflow guard を指摘。修正済み  |
| 1     | Privacy / Trust Copy          | HOLD    | Settings の vendor retention 期間断定を指摘。修正済み                                     |
| 2     | Product UX / Entry Flow       | HOLD    | Record AI consent の retention 期間断定を指摘。修正済み                                   |
| 2     | Visual System / Accessibility | GO      | semantic section、`min-w-0`、`break-words`、icon language は問題なし                      |
| 2     | Privacy / Trust Copy          | HOLD    | Record AI consent と旧 test expectation の retention 期間断定を指摘。修正済み             |
| 3     | Privacy / Trust Copy          | GO      | active UI の retention 期間断定、ZDR、削除・復元・OAuth・Store claim なし                 |
| 3     | Product UX / Entry Flow       | HOLD    | trust copy は解消済み。`ISSUE-079` の stale `status: review` assertion のみ指摘。修正済み |

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/design/ai-consent-privacy-evidence.md`
- `docs/issues/ISSUE-076-lp-app-visual-grammar.md`
- `docs/issues/ISSUE-077-keepsake-primitives-icon-language.md`
- `docs/issues/ISSUE-078-record-lp-app-alignment.md`
- `docs/issues/ISSUE-079-bottomnav-action-icon-alignment.md`
