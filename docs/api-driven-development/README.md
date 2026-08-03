# Hana API 駆動開発ガイド

> このドキュメントは、Hana プロジェクトで API 駆動開発を継続するための単一の入口です。
> 詳細な規約は同階層の各ファイルに分割しています。

---

## 0. 目的

- **OpenAPI を Single Source of Truth** にする
- フロントとバックエンドの認識ズレを構造的に防ぐ
- AI（Claude Code）が毎回ブレずに同じ手順で開発できるようにする
- 個人開発でも継続できる軽量な運用を保つ

---

## 1. 開発フロー（厳守）

```
1. Issue を立てる（受け入れ条件まで書く）
   ↓
2. docs/openapi/openapi.yaml を更新（paths / schemas / examples）
   ↓
3. npm run openapi:lint で合法性を確認
   ↓
4. npm run openapi:gen で型を再生成（差分を PR に含める）
   ↓
5. バックエンド実装（生成型に従う）
   ↓
6. フロント実装（生成型 + TanStack Query）
   ↓
7. テスト（schema validation / request spec / UI）
   ↓
8. 動作確認 → Issue 更新 → PR
```

**鉄則**: 実装が先に進んで仕様が後追いになることを禁止する。先に `openapi.yaml` を直す。

---

## 2. ディレクトリ構成

```
Hana/
├── CLAUDE.md
├── Hana_PRD_v1.md
├── docs/
│   ├── api-driven-development/      ← このディレクトリ
│   ├── openapi/                     ← API 仕様の正本
│   ├── adr/                         ← 採用判断の記録
│   └── issues/                      ← Issue の永続コピー
├── src/
│   ├── features/<feature>/
│   ├── lib/api/client.ts            ← 薄い fetch ラッパー
│   ├── lib/api/generated/           ← OpenAPI 由来の型（Git 管理・直接編集禁止）
│   └── server/                      ← バックエンド（同居の場合）
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── unit/
│   └── e2e/
└── .claude/
    ├── commands/
    ├── skills/
    └── settings.json
```

役割の詳細は CLAUDE.md と各サブドキュメントを参照。

---

## 3. ツールチェイン（推奨）

| 領域             | 推奨ライブラリ                            | 役割                                  |
| ---------------- | ----------------------------------------- | ------------------------------------- |
| OpenAPI          | OpenAPI 3.1                               | API 契約フォーマット                  |
| Lint             | `@redocly/cli`, `@stoplight/spectral-cli` | OpenAPI の妥当性検証                  |
| Bundle           | `@redocly/cli`                            | 分割ファイルを 1 つに集約             |
| 型生成           | `openapi-typescript`                      | `paths` 型の生成                      |
| API クライアント | `openapi-fetch`                           | 型安全な fetch ラッパー               |
| データフェッチ   | `@tanstack/react-query` v5                | キャッシュ・楽観更新                  |
| モック           | `msw` v2                                  | 開発時 / Storybook / E2E              |
| 契約テスト       | `schemathesis`                            | OpenAPI と実装の整合性                |
| 破壊変更検知     | `oasdiff`                                 | CI でブレイキングチェンジを失敗させる |

これらは推奨デフォルトであり、置き換えはコメントで議論可能。ただし「OpenAPI を真実の源にする」原則は固定。

---

## 4. npm scripts 規約

`package.json` に下記スクリプトを **必ず** 揃える。

```json
{
  "scripts": {
    "openapi:lint": "redocly lint docs/openapi/openapi.yaml && spectral lint docs/openapi/openapi.yaml",
    "openapi:bundle": "redocly bundle docs/openapi/openapi.yaml -o docs/openapi/openapi.bundled.yaml",
    "openapi:gen": "openapi-typescript docs/openapi/openapi.yaml -o src/lib/api/generated/schema.d.ts",
    "openapi:check-breaking": "oasdiff breaking --fail-on WARN origin/main:docs/openapi/openapi.yaml docs/openapi/openapi.yaml",
    "openapi:route-map": "node scripts/check-openapi-route-map.mjs",
    "openapi:auth-contract": "node scripts/check-route-auth-contract.mjs",
    "openapi:all": "npm run openapi:lint && npm run openapi:route-map && npm run openapi:bundle && npm run openapi:gen",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:contract": "schemathesis run http://localhost:3000/openapi.json"
  }
}
```

---

## 5. OpenAPI 規約（要約）

詳細は `openapi-style-guide.md` を参照。

- **バージョン**: OpenAPI 3.1
- **paths**: 小文字 / 複数形 / ハイフン無し
- **operationId**: lowerCamel、動詞 + リソース
- **schemas**: UpperCamel
- **ID**: `format: uuid`
- **日時**: `format: date-time`（RFC3339 / UTC）
- **ページング**: カーソル方式（`limit` + `cursor` + `next_cursor`）
- **認証**: `cookieSession`（Supabase SSR Cookie。ADR-0015）
- **バージョニング**: URL ベース（`/v1/...`）

---

## 6. エラー形式: RFC9457 Problem Details（要約）

詳細は `error-format.md` を参照。

```json
{
  "type": "https://hana.app/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "入力内容に誤りがあります",
  "reason": "validation_error",
  "instance": "req_01HXYZ...",
  "errors": [{ "path": "body.name", "reason": "required", "message": "必須項目です" }]
}
```

- Content-Type: `application/problem+json`
- クライアントは `reason`（安定 ID）で分岐する

---

## 7. 型生成と API クライアント

### 型は生成物を使う

```ts
import type { paths, components } from '@/lib/api/generated/schema'

type Memory = components['schemas']['Memory']
type ListMemoriesResponse =
  paths['/v1/memories']['get']['responses']['200']['content']['application/json']
```

- 手書きで API 型を作らない
- 画面用の型は `src/features/<feature>/view-models/` に置く
- API 型 → ViewModel への変換関数を経由する

### 薄い fetch ラッパー

`src/lib/api/client.ts` の責務は以下に絞る:

1. baseUrl の付与
2. same-origin cookieの送信（Browser API clientはBearerを重ねない）
3. レスポンスが `application/problem+json` なら `ProblemDetails` として throw
4. `X-Request-Id` の付与
5. ロギング（**body は出さない**）

リトライ・キャッシュ・楽観更新は TanStack Query 側でやる。

### TanStack Query 連携

- hook は `src/features/<feature>/api/` に置く
- queryKey は `['memories', { childId, year, month }]` のように OpenAPI のパラメータをそのまま使う
- `select` で ViewModel 変換
- エラーは `ProblemDetails` のまま渡し、UI で `reason` で分岐

---

## 8. Issue 管理ルール

### 粒度

- 1 Issue = 半日〜2日で完了
- それより大きければ分割

### テンプレート

`docs/issues/ISSUE-XXX-<slug>.md` に下記 frontmatter で保存。

```markdown
---
id: ISSUE-XXX
title: <短い動詞句>
priority: P0 | P1 | P2
status: todo | in_progress | review | done | blocked
size: S | M | L
created_at: YYYY-MM-DD
---

## 目的 (Why)

## スコープ (What)

## やらないこと (Out of Scope)

## 影響範囲

## 受け入れ条件 (Acceptance Criteria)

## セキュリティ・プライバシー考慮

## 参考
```

### ステータス遷移

```
todo → in_progress → review → done
                  ↓
              blocked
```

### Issue Index と GitHub 状態の照合

- `docs/issues/README.md` は frontmatter から生成する。直接編集しない。
- `pnpm issues:write`: frontmatter を検証し、Issue Index を決定的に再生成する。
- `pnpm issues:check`: schema、Issue ID / `github_issue` 重複、許可status、生成差分を検証する。
- `pnpm issues:check-github -- --github-status-file <status-only.json>`: GitHub IssueのOPEN/CLOSEDとlocal statusを照合する。
- `pnpm issues:sync-github -- --github-status-file <status-only.json>`: closed GitHub Issueに対応するlocal `review`だけを`done`へ同期する。
- GitHub入力はIssue番号とOPEN/CLOSEDだけに限定し、本文、コメント、ユーザー情報、secretを取得・artifact保存しない。

### PR との対応

- 1 PR 1 Issue
- PR タイトル: `[ISSUE-XXX] <要約>`
- PR 本文に `Closes #XXX`、変更点、テスト結果、動作確認手順

---

## 9. テスト戦略（要約）

| レイヤ       | ツール                  | 確認内容                  |
| ------------ | ----------------------- | ------------------------- |
| OpenAPI Lint | redocly / spectral      | 仕様の妥当性              |
| 生成差分     | openapi-typescript + CI | 生成漏れ検知              |
| 契約         | schemathesis            | 実装と OpenAPI の整合     |
| Unit         | vitest                  | 純粋関数 / ViewModel      |
| Integration  | vitest + supertest      | request spec / 認可       |
| E2E          | playwright              | golden path               |
| AI 出力      | カスタム                | 性質テスト                |
| セキュリティ | カスタム                | ログ PII / Presigned 期限 |

---

## 10. セキュリティ・プライバシー（要約）

詳細は `security-and-privacy.md` を参照。

- 画像は Presigned URL（30 分）経由のみ
- `Cache-Control: private, max-age=300`（ADR-0012）
- AI 送信前に EXIF 除去 + PII マスキング（MVP の EXIF 除去は ADR-0009 の通りクライアント側）
- ログ出力は許可リスト方式
- 退会時は 30 日後に物理削除（DB + Storage）

---

## 11. Claude Code 運用ルール（要約）

詳細は `CLAUDE.md` を参照。

- 着手前に Issue / PRD 該当章 / OpenAPI を読む
- 3〜10 行の着手計画を出してから手を動かす
- API 変更は OpenAPI から書く
- 生成物は直接編集しない
- destructive 操作は事前確認
- 同じコマンドを 3 回失敗したら止まって報告
- PII をログ・コミット・テストフィクスチャに含めない

---

## 12. ADR（採用判断の記録）

技術選定や設計方針の判断は `docs/adr/NNNN-<slug>.md` に記録する。

形式は下記の最小構成で十分:

```markdown
# NNNN. タイトル

- Status: proposed | accepted | superseded
- Date: YYYY-MM-DD
- Activation gate: 必要な場合だけ、有効化に必要な人間判断や後続条件

## Context

## Decision

## Consequences
```

最初の ADR は `0001-openapi-as-sot.md`（OpenAPI を真実の源にする決定）として残す。

---

## 13. 参考

- `Hana_PRD_v1.md` — プロダクト仕様
- `docs/openapi/openapi.yaml` — API 仕様
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
