---
name: API Change
about: API 仕様の追加・変更（OpenAPI 更新を伴うもの）
title: '[ISSUE-XXX] API: '
labels: ['type:api']
assignees: []
---

<!--
このテンプレは OpenAPI を変更する Issue 用です。
docs/issues/ISSUE-XXX-<slug>.md にも保存してください。
-->

## API 変更の種別

- [ ] 新規追加（互換）
- [ ] フィールド追加（互換）
- [ ] フィールド削除・型変更（**破壊変更 → v2 検討**）
- [ ] エラー追加 / `reason` 追加

## 目的 (Why)

<このAPI変更で実現したいこと>

## OpenAPI 更新内容

```diff
# docs/openapi/openapi.yaml の更新前後サマリを記述
```

- paths: <追加/変更されるパス>
- schemas: <追加/変更されるスキーマ>
- examples: <追加するサンプル>

## クライアント影響

- 影響する hook / 画面 / feature
- ViewModel の変更要否
- 既存呼び出し箇所のリストアップ

## マイグレーション

- DB スキーマ変更: <あり / なし>
- 既存データへの影響: <あり / なし>
- バックフィル要否: <あり / なし>

## 受け入れ条件

- [ ] `pnpm openapi:lint` 通過
- [ ] `pnpm openapi:gen` 実行済み（差分コミット）
- [ ] `pnpm openapi:check-breaking` 結果を本文に貼付（破壊変更なしを確認 or 受容判断）
- [ ] サーバ実装が OpenAPI に準拠（契約テスト通過）
- [ ] 認可テスト追加
- [ ] ログに PII が出ない

## セキュリティ・プライバシー考慮

- [ ] 認可: user_id 所有権チェック
- [ ] 画像/PII を扱う場合のマスキング
- [ ] AI 送信前の EXIF / 氏名除去

## 優先度

- priority: P0 | P1 | P2
