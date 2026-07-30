---
id: ISSUE-132
title: サインアウト失敗を検知しセッション残存を誤表示しない
priority: P1
status: review
size: S
created_at: 2026-07-30
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

- [ ] `/sign-out` は Supabase signOut の失敗を固定 reason の ProblemDetails で返す
- [ ] 設定画面は成功確認後だけ認証関連キャッシュと記録下書きを消去する
- [ ] 失敗時は設定画面に留まり、セッション状態を誤表示せず再試行できる
- [ ] 成功、ネットワーク失敗、Supabase失敗のテストがある
- [ ] ログへ token、cookie、メール、記録本文を出力しない

## セキュリティ・プライバシー考慮

失敗の詳細や認証情報をログ・画面へ出さない。サーバ成功前はローカル状態を変更せず、セッションが残る可能性を隠さない。

## Review gates

Security / Reliability / UX レビュー、`pnpm pr:gate`、`git diff --check`。
