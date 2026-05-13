# 0001. OpenAPI を API 仕様の Single Source of Truth にする

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

Hana は個人開発の AI 育児記録アプリで、フロントエンド・バックエンド・AI 連携・将来的なネイティブクライアントを 1 人（+ Claude Code）で運用する。
API 仕様が PRD・コード・脳内に分散すると、3 ヶ月後の自分が混乱し、Claude Code も毎回違うコードを書く。

API 仕様の管理方法として以下を比較した。

- (A) コードファースト（コードから OpenAPI を生成）
- (B) 仕様ファースト（OpenAPI を書いてから実装）
- (C) ドキュメントのみ（PRD と README で管理）

## Decision

**(B) 仕様ファースト** を採用する。`docs/openapi/openapi.yaml` を **Single Source of Truth** とし、下記を厳守する。

1. API 変更は `openapi.yaml` を **先に** 直す
2. `openapi-typescript` で TypeScript 型を生成し、`src/lib/api/generated/` に置く（Git 管理）
3. CI で生成物の更新漏れを `git diff --exit-code` により失敗扱いにする
4. 全エラー応答は **RFC9457 Problem Details**（`application/problem+json`）に統一
5. URL バージョニング（`/v1/...`）。破壊変更は `/v2` 並走で対応
6. ページネーションはカーソル方式に統一

## Consequences

### 良い点

- フロント・バック・テストの認識ズレが構造的に消える
- 型エラーが「実装の更新漏れ」を教えてくれる（OpenAPI を直すと自動的に TODO が可視化）
- Claude Code が `openapi.yaml` を読めば API 契約を一瞬で把握できる
- 個人開発でも 3 ヶ月放置から復帰しやすい

### 悪い点 / 受容するコスト

- 仕様 → 実装の手順を踏むので、1 機能あたりの初動が遅い（コードファーストより 30 分〜2 時間程度）
- OpenAPI の表現力が足りない場合の workaround が必要（複雑な multipart 等）
- ライブラリのバージョンアップ追従が必要（`openapi-typescript`, `redocly` 等）

これらは API 駆動開発の継続性と引き換えに受容する。

## Implementation Notes

- 詳細フローは [`docs/api-driven-development/README.md`](../api-driven-development/README.md)
- 関連 Issue: ISSUE-002（OpenAPI 基盤）、ISSUE-003（型生成パイプライン）

## References

- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [openapi-typescript](https://openapi-ts.dev/)
