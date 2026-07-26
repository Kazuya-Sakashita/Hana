---
id: ISSUE-089
title: 待機リスト登録後の連絡期待値を明確にする
priority: P1
status: review
size: S
created_at: 2026-07-26
github_issue: 202
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-089: 待機リスト登録後の連絡期待値を明確にする

## 目的 (Why)

公開前検証の待機リスト登録後に、ユーザーが「何の連絡を受けるのか」と「案内停止や登録情報削除をどう依頼できるのか」を成功状態でも確認できるようにする。

## スコープ (What)

- `/lp` の待機リスト登録成功 copy を、承認済みの利用目的に合わせて更新する
- 案内停止・登録情報削除の問い合わせメール導線を成功状態または近接 copy で確認できるようにする
- public QA / unit test が、承認済み公開連絡先のみを許可し、未承認メールや過剰 claim を引き続き拒否することを確認する
- `docs/issues/README.md` を同期する

## やらないこと (Out of Scope)

- メール配信基盤のサービス名を公開 copy に出さない
- 新しい問い合わせフォームや管理画面は作らない
- Store ダウンロード CTA への切り替えは正式公開時の別 Issue とする
- `POST /v1/waitlist` の request / response contract は変更しない

## 影響範囲

- `src/components/waitlist-signup-form.tsx`
- `tests/unit/app/prelaunch-lp-route.test.ts`
- `tests/unit/app/lp-public-qa-trust-gate.test.ts`
- `docs/design/current-lp-evaluation.md`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] 待機リスト登録成功時の copy が、β版案内、任意のインタビュー / フィードバック協力、正式リリースのお知らせに限定されている
- [x] 案内停止・登録情報削除の連絡先として問い合わせメールが確認できる
- [x] public surface の証跡安全性が、公開連絡先以外のメール、画像 URL、`storage_key`、prompt、AI 生成本文、過剰 claim を拒否する
- [x] `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- 公開連絡先以外のメールアドレスを証跡やテスト fixture に残さない
- 実ユーザーの写真、子ども / 親の実名、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文を扱わない
- Privacy / Legal review 済みの公開前検証 copy をベースラインにし、正式公開前に運用が変わる場合だけ再レビューする

## 検証

- [x] `pnpm exec vitest run tests/unit/app/prelaunch-lp-route.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts`
- [x] `pnpm qa:issue075:lp-public -- --mode=contract`
- [x] `pnpm qa:issue075:lp-public -- --mode=app`
- [x] `pnpm pr:gate`

app mode では `/lp` と `/privacy` を 390x844 / 430x932 / 768x1024 / 1280x900 で確認した。
`/lp` は waitlist submit を mock し、成功後の `data-waitlist-accepted-guidance="prelaunch"`、
連絡用途の限定、案内停止・登録情報削除の問い合わせメール導線を確認した。
証跡は redacted DOM / performance summary のみで、screenshot / trace / HAR は保存していない。

## 専門レビュー

read-only の専門サブエージェントで、最大 3 回まで再レビューする。blocking finding が出た場合は、この Issue 内で修正して再確認する。

| round | reviewer                     | verdict | notes                                                              |
| ----- | ---------------------------- | ------- | ------------------------------------------------------------------ |
| 1     | Privacy / Legal Trust Copy   | GO      | 連絡用途の限定、公開連絡先、配信基盤非明記、過剰 claim なしを確認  |
| 1     | Public UX / Accessibility    | GO      | 成功後 guidance、mailto link、tap target、focus、form 非追加を確認 |
| 1     | Release QA / Evidence Safety | HOLD    | PR 前に `done` としていたため、`review` queue へ戻す必要あり       |
| 2     | Release QA / Evidence Safety | GO      | `status: review`、README review queue、done archive 非掲載を確認   |
