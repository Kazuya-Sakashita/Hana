---
id: ISSUE-132
title: サインアウト失敗を検知しセッション残存を誤表示しない
priority: P1
status: done
size: S
created_at: 2026-07-30
github_issue: 278
---

## 目的 (Why)

サインアウト結果を確実に判定し、未完了時は利用者へ安全な再試行案内を表示する。

## スコープ (What)

- Supabase signOut 結果のサーバ判定
- 成功時だけの認証関連キャッシュ・記録下書き消去
- 失敗時に設定画面へ留まる再試行案内

## やらないこと (Out of Scope)

- 認証 provider の変更
- セッション有効期限の変更

## 影響範囲

- `POST /sign-out`
- 設定画面のサインアウト操作
- query、画像URL、記録下書きのローカルキャッシュ

## 受け入れ条件 (Acceptance Criteria)

- [x] `/sign-out` は Supabase signOut の失敗を固定 reason の ProblemDetails で返す
- [x] 設定画面は成功確認後だけ認証関連キャッシュと記録下書きを消去する
- [x] 失敗時は設定画面に留まり、セッション状態を誤表示せず再試行できる
- [x] 成功、ネットワーク失敗、Supabase失敗のテストがある
- [x] ログへ token、cookie、メール、記録本文を出力しない

## セキュリティ・プライバシー考慮

失敗の詳細や認証情報をログ・画面へ出さない。サーバ成功前はローカル状態を変更せず、セッションが残る可能性を隠さない。

`/sign-out` はブラウザのセッションCookieを操作するWeb認証ルートであり、`/v1`公開APIのOpenAPI契約対象外とする。成功後のローカル削除はbest-effortで全件実行し、端末ストレージの削除失敗をサーバーのサインアウト失敗として誤表示しない。

## Review gates

Security / Reliability / UX レビュー、`pnpm pr:gate`、`git diff --check`。

## 検証結果

- サーバー成功、Supabase失敗、throw、ネットワーク失敗をテスト
- サーバー成功後にローカル削除が失敗しても、残りの削除を実行して成功扱いにすることをテスト
- 設定画面で失敗時に遷移せず、警告、ボタン再有効化、再試行成功をDOMテスト
