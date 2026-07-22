---
id: ISSUE-004
title: API クライアント基盤 (openapi-fetch + ProblemDetails 型ガード)
priority: P0
status: done
size: M
created_at: 2026-05-14
github_issue: 7
---

## 目的 (Why)

すべての画面 / hook / サーバ間通信の足回りになる **薄い API クライアント** を整える。
ここが揃わないと、ISSUE-005 以降の認証・children・uploads・memories・AI が
バラバラの fetch 実装を持ってしまい、ログ・エラー処理・認証ヘッダ・PII 漏洩対策が
散らばる。

具体的に解決したい問題:

- API 型は OpenAPI 由来（ISSUE-003）だが、それを使う **fetch ラッパー** が無い
- `application/problem+json` を受けたら **`ProblemDetails` として throw** する規約をコードに固定したい
- 認証ヘッダ・request id・ロギングを **1 ヶ所で集約** したい
- ログに PII（body / メール / 画像 URL）が出ないことを **設計時に担保** したい

---

## スコープ (What)

### ライブラリ

- [ ] `openapi-fetch` を runtime dependency に追加
- [ ] バージョンは `openapi-typescript` と整合する系列を選ぶ

### `src/lib/api/client.ts` (薄い fetch ラッパー)

責務を **最小限** に絞る:

- [ ] baseUrl を設定（`/v1`、サーバ実体は ISSUE-005 以降で同居）
- [ ] `Authorization: Bearer <token>` の自動付与（トークン解決関数を注入できる形）
  - 実トークン管理（保存・リフレッシュ）は **ISSUE-005 の認証** で扱う
  - 本Issueでは「トークン解決関数を受け取って付与する」インターフェースだけ用意する
- [ ] `X-Request-Id` ヘッダの付与（クライアント発行 ULID。サーバが受けて ProblemDetails.instance に詰める）
- [ ] レスポンスが `application/problem+json` なら `ProblemDetails` として **throw**
- [ ] ロギング: method / path / status / elapsed / request_id のみ
  - **body は絶対に出さない**
  - 構造化ログ（JSON Lines）形式で `console.info` / `console.error`
- [ ] Server Components / Route Handlers / Client Components のいずれからも使える形

### `src/lib/api/error.ts` (ProblemDetails 型ガード)

- [ ] `ApiProblemError` クラス（`Error` を継承、`problem: ProblemDetails` を保持）
- [ ] `isApiProblemError(e: unknown): e is ApiProblemError` 型ガード
- [ ] `isProblemReason<T extends string>(e: unknown, reason: T)` で `reason` 分岐するヘルパ
- [ ] 生成型 (`components['schemas']['ProblemDetails']`) を **そのまま** 使う（手書き型禁止）

### `src/lib/api/request-id.ts`

- [ ] ULID または `crypto.randomUUID()` ベースの ID 発行関数
- [ ] `req_` プレフィクス付き（OpenAPI の example と整合）

### `src/lib/api/logger.ts` (許可リスト型の構造化ロガー)

- [ ] 出してよいフィールド: `operation` / `method` / `path` / `status` / `elapsed_ms` / `user_id_hash` / `request_id` / `reason`
- [ ] それ以外は **構造的に出せない** API（受け付けるフィールドを型で固定）
- [ ] `LOG_LEVEL` env を尊重（`debug` / `info` / `warn` / `error`）
- [ ] テスト容易性: 出力先を差し替え可能（`Sink` インターフェース）

### テスト (Vitest)

- [ ] `error.ts`: 型ガードが ProblemDetails のみ true、他の object に false
- [ ] `error.ts`: `isProblemReason` の reason 分岐が正しい
- [ ] `request-id.ts`: フォーマット正規表現と一意性
- [ ] `logger.ts`: 許可フィールドのみ出力されること、body / メール / 画像URLが Sink に届かないこと
- [ ] `client.ts`: 200/422/401 レスポンスを `fetch` モック（Vitest の `vi.spyOn`）で再現し
  - 200 → JSON を返す
  - 4xx with `application/problem+json` → `ApiProblemError` を throw
  - 4xx with text/plain → 汎用 Error（reason `unknown_error`）
  - すべての成功・失敗で ロガーが PII を出さない

### ドキュメント

- [ ] `docs/api-driven-development/api-client.md`（クライアント設計の規約。トークン解決・ロガー差し替え・テスト書き方）
- [ ] `src/lib/api/README.md`（使用例を最小限）

---

## やらないこと (Out of Scope)

- JWT トークンの **取得・保存・リフレッシュ**（→ ISSUE-005 認証）
- 実 API エンドポイント追加（→ ISSUE-005 以降）
- TanStack Query 統合（薄ラッパーが安定したら別 Issue で）
- MSW モック設定（別 Issue）
- 認可（user_id 所有権チェック）の実装（サーバ側）

---

## 影響範囲

| 領域         | 影響                                                 |
| ------------ | ---------------------------------------------------- |
| OpenAPI      | なし                                                 |
| 生成型       | 既存生成物を **参照のみ**（手書き API 型は作らない） |
| 画面         | まだ呼び出されない（次以降の Issue で利用開始）      |
| データ       | なし                                                 |
| CI           | なし（既存 typecheck/lint/test ジョブで担保）        |
| ドキュメント | `api-client.md` 新規 + 生成物 README 微更新          |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `openapi-fetch` が dependencies に追加されている
- [ ] `src/lib/api/{client,error,logger,request-id}.ts` が作成され `pnpm typecheck` 通過
- [ ] `pnpm test` で本 Issue で追加したテストがすべて通る
- [ ] `pnpm lint` / `pnpm format:check` 通過
- [ ] エラー応答（`application/problem+json`）が `ApiProblemError` として throw される
- [ ] ロガーに body / メール / 画像 URL / storage_key が **構造的に渡せない**（型で禁止）
- [ ] `api-client.md` に使用例 + テスト方針 + トークン解決の注入方法が書かれている
- [ ] `src/lib/api/README.md` に最小コードサンプル
- [ ] 生成型 (`components['schemas']['ProblemDetails']`) を import し、手書きの ProblemDetails 型を作っていない

---

## セキュリティ・プライバシー考慮

- [ ] **body をログしない**: ログラッパーは body フィールドを受け付けない（型で禁止）
- [ ] **PII フィールドをログしない**: メール・氏名・画像URL・storage_key を受け付けない
- [ ] **user_id はハッシュ化**: ハッシュ関数のインターフェースだけ用意（実装は ISSUE-005）
- [ ] **トークンをログしない**: `Authorization` ヘッダはロガーの input に渡らない設計
- [ ] **request_id は推測不可能**: ULID / UUID を使用
- [ ] **5xx の `detail` は固定文言**: クライアント側ではこの規約に依存しない（サーバ責務）

---

## 設計メモ

### `openapi-fetch` を採用する理由

- 生成型 (`paths`) を generic として受けるだけの極薄ラッパー
- 数 KB なので個人開発のメンテ負荷が最小
- Server Components / Edge / Node / Browser で動く

### `Authorization` ヘッダの注入インターフェース（案）

```ts
// 案: 関数で遅延解決（本Issueで型だけ確定）
type TokenResolver = () => Promise<string | null>

createClient({
  baseUrl: '/v1',
  resolveAuthToken: async () => /* ISSUE-005 で実装 */ null,
  logger: createApiLogger({ level: 'info' }),
})
```

### ロガーの安全性

ロガーが受け付ける `LogFields` を **closed object type** にすることで、
「body をうっかりログに渡す」事故を **コンパイル時に防ぐ**。

```ts
// 例（最終形は実装時に確定）
type LogFields = {
  operation: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  status?: number
  elapsed_ms?: number
  request_id?: string
  user_id_hash?: string
  reason?: string
}
```

---

## 参考

- ISSUE-002（ProblemDetails 仕様）
- ISSUE-003（生成型）
- `CLAUDE.md` §7 (PII / ログ)
- `docs/api-driven-development/error-format.md`
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)

---

## 実施結果 (2026-05-14)

### 作成・変更ファイル

- `package.json`: `openapi-fetch@0.17.0` を runtime dependency に追加
- `src/lib/api/client.ts`: `openapi-fetch` ベースのクライアント生成 + middleware
- `src/lib/api/error.ts`: `ApiProblemError`、`isApiProblemError`、`isProblemReason`、`isProblemDetails`
- `src/lib/api/logger.ts`: closed object type `LogFields` + Sink 注入 + 構造化 JSON 出力
- `src/lib/api/request-id.ts`: `req_<uuid>` 発行と判定
- `src/lib/api/README.md`: 構成と最小サンプル
- `vitest.config.ts`: alias 設定（`@/* → src/*`）+ test glob
- `tests/unit/lib/api/{request-id,logger,error,client}.test.ts`: 全 19 件
- `docs/api-driven-development/api-client.md`: 設計規約と使用例
- `docs/issues/ISSUE-004-api-client-foundation.md`: 本Issue

### 検証結果

- [x] `pnpm typecheck` グリーン
- [x] `pnpm lint` グリーン
- [x] `pnpm test` 19 件パス
- [x] `pnpm format:check` グリーン
- [x] `pnpm build` 成功
- [x] ロガーに body / メール / 画像URL / storage_key が **コンパイル時** に渡せないことを確認

### スコープ調整

- ULID ではなく `crypto.randomUUID()` を採用（依存追加なし、Node 24 / ブラウザ両対応）
- `LOG_LEVEL` env への自動連動はしていない（明示注入のみ）。env 連動は呼び出し側の責務に倒した
- Server / Browser での `resolveAuthToken` 分離は ISSUE-005 で具体化

### PR ドラフト

タイトル: `[ISSUE-004] API クライアント基盤 (openapi-fetch + ProblemDetails 型ガード)`
