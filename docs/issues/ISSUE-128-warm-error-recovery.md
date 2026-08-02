---
id: ISSUE-128
title: 404・予期しないエラーを温かい復帰画面にする
priority: P1
status: done
size: M
created_at: 2026-07-30
github_issue: 274
---

## 目的 (Why)

フレームワーク既定のエラー表示を避け、利用者を責めずに安全な次の操作を選べるようにする。

## スコープ (What)

- アプリ共通の 404 画面
- 予期しないエラーの共通 error boundary
- 再試行、ホーム、アルバムへの復帰導線

## やらないこと (Out of Scope)

- 外部監視サービス導入
- 個別 API エラー文言の一括変更
- オフライン PWA 対応

## 影響範囲

- App Router の not-found / error boundary
- 404 と予期しない例外発生時の復帰操作
- モバイル・タブレットのエラー表示

## 受け入れ条件 (Acceptance Criteria)

- [ ] 404 と予期しないエラーを責めない日本語で区別する
- [ ] error boundary から再試行できる
- [ ] 404 からホームまたはアルバムへ戻れる
- [ ] 内部エラー、stack、PII、request 情報を画面やログへ追加しない
- [ ] 44px 操作領域、visible focus、見出し構造を満たす
- [ ] 390px、430px、768pxの回帰テストがある

## セキュリティ・プライバシー考慮

error オブジェクトの message、stack、digest を描画・記録せず、固定された安全な文言だけを表示する。

## Review gates

Interaction Design / Accessibility / Security レビュー、`pnpm pr:gate`、`git diff --check`。
