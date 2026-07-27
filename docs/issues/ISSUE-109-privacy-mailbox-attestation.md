---
id: ISSUE-109
title: privacy mailbox 運用 attestation を追加する
priority: P0
status: review
size: S
created_at: 2026-07-28
github_issue: 237
parent: ISSUE-105
blocked_by: []
external_blockers:
  - privacy_mailbox_live_confirmation
requires_human_review:
  - privacy
  - security
  - release
---

# ISSUE-109: privacy mailbox 運用 attestation を追加する

## 目的 (Why)

`privacy@hana.app` の受信、アクセス制御、案内停止、登録情報削除の運用確認を、担当者名や問い合わせ内容を記録せず GO / HOLD で再現可能に判定する。

## スコープ (What)

- mailbox の受信確認を human attestation として扱う
- 運用担当者のアクセス制御確認を human attestation として扱う
- 案内停止と登録情報削除の運用確認を個別の human attestation として扱う
- 未確認項目が 1 つでもあれば HOLD、全項目確認時だけ GO にする
- strict CLI parsing で重複、未知、欠損、位置引数を安全側の HOLD にする
- attestation に `scope`、運用版、実行時刻を付け、運用変更後の再利用を禁止する
- AST allowlist で read-only import と危険 API 不使用を契約検査する
- read-only contract mode を `pnpm pr:gate` に接続する
- 公開前 Runbook、ISSUE-103 preflight、ISSUE-105 の解除条件を同期する

## やらないこと (Out of Scope)

- mailbox への接続、test mail の送信、問い合わせ返信
- 実メール、担当者名、問い合わせ本文、削除対象情報の表示・保存
- 配信停止やDB削除の自動実行
- mailbox provider、認証方式、担当者の特定
- API / OpenAPI / DB / LP / privacy copy の変更

## 影響範囲

- `scripts/qa/issue-109-privacy-mailbox-attestation.cjs`
- `tests/unit/app/privacy-mailbox-attestation.test.ts`
- `scripts/qa/issue-103-prelaunch-traffic-attestation.cjs`
- `tests/unit/app/prelaunch-traffic-attestation.test.ts`
- `package.json`
- `docs/release/prelaunch-waitlist-readiness.md`
- `docs/issues/ISSUE-105-staging-preflight-go-hold.md`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] 未確認項目が 1 つでもあれば HOLD になる
- [x] 受信、アクセス制御、案内停止、登録情報削除の全項目確認時だけ GO になる
- [x] 実メール、担当者名、問い合わせ本文を stdout / stderr に出力しない
- [x] contract mode が `pnpm pr:gate` に接続される
- [x] unit tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- command は固定metadata、安定したcheck ID、kind、pass / holdだけを出力する
- argument が `confirmed` 以外でも入力値を response、stdout、stderr に反映しない
- 重複、未知、欠損、位置引数は値を出さず `invalid_arguments` と HOLD に正規化する
- script は repository file の read と CLI argument の一致判定だけを行い、network request や file write を行わない
- QA command はNode Permission Modelを必須にし、file write、child process、workerをruntimeで拒否する
- network API / import はAST allowlistで拒否し、Node Permission Modelによるnetwork遮断はclaimしない
- filesystem readはcontract検査に必要な固定fileと`node_modules`だけを許可し、repository全体を許可しない
- command の GO は人間の確認結果であり、mailbox や削除処理を自動検証したという claim にはしない
- access権、mailbox / 配信基盤、waitlist schema、案内停止・削除手順が変わった場合は再attestする
- live confirmation が完了するまで ISSUE-105 と公開前 traffic は HOLD を維持する

## 検証

- [x] `pnpm qa:issue109:privacy-mailbox -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/privacy-mailbox-attestation.test.ts`
- [x] `pnpm pr:gate`
