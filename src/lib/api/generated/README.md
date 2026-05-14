# 自動生成された API 型定義

このディレクトリのファイル（`schema.d.ts` 等）は **OpenAPI から自動生成** されます。
**直接編集しないでください。**

## 再生成

```bash
pnpm openapi:gen
```

または OpenAPI のフルパイプライン:

```bash
pnpm openapi:all
```

## 仕組み

- 入力: `docs/openapi/openapi.yaml`
- 出力: `src/lib/api/generated/schema.d.ts`
- ツール: [`openapi-typescript`](https://openapi-ts.dev/)
- CI: PR 時に `openapi:gen` を実行し、生成物に差分があれば失敗する
  （→ OpenAPI を変更した PR で再生成漏れを防ぐ）

## 使い方

```ts
import type { paths, components } from '@/lib/api/generated/schema'

type ProblemDetails = components['schemas']['ProblemDetails']
type HealthResponse = paths['/health']['get']['responses']['200']['content']['application/json']
```

## 注意

- このディレクトリは Git 管理されています（生成漏れ検知のため）
- `.prettierignore` / `.eslintignore` で整形・lint の対象外にしています
- 直接編集すると `git diff` で検知され CI が失敗します
- 編集が必要なら、まず `docs/openapi/openapi.yaml` を更新してから `pnpm openapi:gen` を実行してください
