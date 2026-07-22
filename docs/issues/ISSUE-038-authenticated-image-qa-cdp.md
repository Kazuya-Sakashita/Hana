---
id: ISSUE-038
title: 認証済み画像QAをCDPで自動化
priority: P1
status: review
size: S
created_at: 2026-07-23
parent: ISSUE-028
github_issue: 80
---

## 目的 (Why)

ISSUE-028 / GitHub Issue #43 の残りである認証済みブラウザ Network QA を、ログイン済み Chrome の CDP から再現可能にする。

ISSUE-028 の実装自体は merge 済みだが、 DevTools Network / lazy load / Lighthouse / LCP は実データを持つ認証済み環境でしか完了扱いにできない。まず Network 側の確認を安全に自動化し、 signed URL や storage_key を記録に残さず証跡化できるようにする。

## スコープ (What)

- CDP 経由で `/album` と `/memory/{id}` を開く QA スクリプトを追加する
- `/album` の画像 request が thumbnail WebP variant であることを判定する
- `/album` の scroll 後に追加画像 request が出た場合、 lazy load を観測済みにする
- `/memory/{id}` の画像 request が preview WebP variant であることを判定する
- signed URL / storage_key / AI 生成本文 / 子ども名を出力しない
- QA 手順を `docs/perf/` に残し、 #43 の未完項目へ接続する

## やらないこと

- Chrome の起動や Google OAuth ログインを自動化しない
- 実データの作成、 DB / Storage への書き込みはしない
- Lighthouse / LCP 計測そのものはこの Issue では自動化しない

## 影響範囲

| 領域         | 影響                                      |
| ------------ | ----------------------------------------- |
| OpenAPI      | なし                                      |
| 生成型       | なし                                      |
| 画面         | なし                                      |
| QA           | CDP 画像 Network QA スクリプトを追加      |
| ドキュメント | ISSUE-028 の認証済み QA 手順を追加        |
| セキュリティ | 出力の URL / storage_key redaction を追加 |

## 受け入れ条件

- [x] CDP URL / base URL / memory path を環境変数または CLI option で指定できる
- [x] `/album` の thumbnail WebP variant request を pass / fail で判定できる
- [x] `/album` の scroll 後 lazy request を pass / fail / skipped で判定できる
- [x] `/memory/{id}` の preview WebP variant request を pass / fail / skipped で判定できる
- [x] 出力に signed URL / storage_key / request token / memory 本文 / 子ども名を含めない
- [x] self-test または unit test がある
- [x] QA 手順が `docs/perf/` に残っている

## セキュリティ・プライバシー考慮

- Network event の raw URL はプロセス内判定にのみ使い、 stdout / stderr には出さない
- 出力は件数、 variant 種別、 pass / fail / skipped のみ
- スクリプトは DB / Storage / API へ書き込まない
- 認証は既存のログイン済み Chrome profile に委ねる

## 動作確認手順

```bash
pnpm test tests/unit/scripts/issue-028-image-network-check.test.ts
node scripts/qa/issue-028-image-network-check.mjs --self-test
```

認証済みブラウザでの実行手順は `docs/perf/issue-028-authenticated-browser-qa.md` を参照する。

## 参考

- GitHub Issue #80
- GitHub Issue #43
- `docs/issues/ISSUE-028-perf-next-image.md`
- `docs/perf/issue-028-post-merge-qa-2026-07-22.md`
