---
id: ISSUE-133
title: 記録APIの他者所有と不存在を404へ統一する
priority: P1
status: done
size: S
created_at: 2026-07-30
github_issue: 282
---

## 目的 (Why)

記録IDが外部へ漏れた場合でも、他ユーザーの記録が存在するか判別できないようにする。

## スコープ (What)

- GET / PUT / DELETE `/memories/{memoryId}` の404契約
- 所有者かつ未削除条件を含む記録検索
- 不存在・削除済み・他者所有の同一応答テスト

## やらないこと (Out of Scope)

- 一覧・作成 API の認可変更
- 記録ID形式の変更
- 監査ログの追加

## 影響範囲

- OpenAPI の記録詳細レスポンス契約
- 記録詳細の取得・更新・削除 Route Handler
- セキュリティ回帰テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] OpenAPI の説明とレスポンス契約を先に更新する
- [x] GET / PUT / DELETE は所有者かつ未削除の記録だけを取得する
- [x] 不存在・削除済み・他ユーザー所有はいずれも同じ404 reasonを返す
- [x] 所有者の正常系と既存入力検証を維持する
- [x] 存在判別を防ぐ回帰テストがある
- [x] PIIや識別子実値をログ・証跡へ残さない

## セキュリティ・プライバシー考慮

DB検索に所有者と未削除条件を含め、範囲外の理由をレスポンスやログで区別しない。テストは合成IDだけを使う。

## Review gates

Security / Backend レビュー、`pnpm pr:gate`、`git diff --check`。

## 検証結果

- GET / PUT / DELETEの初期検索を`id + userId + deletedAt: null`へ統一
- 不存在・削除済み・他者所有で同じ404 `not_found`本文を確認
- 初期取得後に削除競合が発生した場合も204ではなく同じ404を返すことを確認
- 所有者の取得・更新・削除、入力検証、更新・削除競合、PIIログ非出力を回帰テスト
