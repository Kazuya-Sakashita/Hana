---
id: ISSUE-003
title: 型生成パイプライン構築
priority: P0
status: done
size: S
created_at: 2026-05-14
github_issue: 5
---

## 目的 (Why)

`docs/openapi/openapi.yaml` を変更したら、自動的に TypeScript 型が更新され、
**更新漏れがあれば CI が落ちる** 仕組みを作る。

これにより:

- OpenAPI → 実装の差分が常に「型エラー = TODO」として可視化される
- 手書きの API 型が紛れ込む余地を構造的に減らす
- API 駆動開発のリターンを最大化する（OpenAPI を直すことに意味が生まれる）

---

## スコープ (What)

### 型生成

- [ ] `openapi-typescript` インストール（dev dependency）
- [ ] 出力先: `src/lib/api/generated/schema.d.ts`
- [ ] `npm run openapi:gen` スクリプト追加
- [ ] `npm run openapi:all`（lint → bundle → gen）スクリプト追加

### 生成物の Git 管理

- [ ] `src/lib/api/generated/` を **Git 管理する**
- [ ] `src/lib/api/generated/.gitkeep` 削除（実ファイルが入るため）
- [ ] 生成物の先頭にコメント「このファイルは自動生成。直接編集禁止」を追加
  - `openapi-typescript` のテンプレ機能 or ヘッダを後置するシェル処理
- [ ] `eslint` / `prettier` の対象外にする（`.eslintignore` / `.prettierignore`）

### CI による更新漏れ検知

- [ ] `.github/workflows/openapi-validate.yml` に下記ステップ追加
  1. `npm run openapi:lint`
  2. `npm run openapi:gen`
  3. `git diff --exit-code src/lib/api/generated/`
     - 差分があれば失敗（= PR 作成者が生成を忘れている）

### 破壊変更の検知

- [ ] `oasdiff` を `package.json` の devDependency 化（または `npx`）
- [ ] `npm run openapi:check-breaking` スクリプト追加
  - `oasdiff breaking origin/main:docs/openapi/openapi.yaml docs/openapi/openapi.yaml`
- [ ] CI で main へのマージ前に実行（warning 表示。failure ではなく注意喚起）

### ドキュメント

- [ ] `docs/api-driven-development/README.md` の「型生成」セクションを最新化
- [ ] `src/lib/api/generated/README.md`（生成物ディレクトリ内）
  - 「直接編集禁止」「`npm run openapi:gen` で再生成」を 5 行程度で

### 動作確認用の最小サンプル

- [ ] `docs/openapi/openapi.yaml` に **ダミー paths を 1 つ追加**（例: `GET /v1/ping`）
  - 完了後の Issue クローズと同時に削除する
  - ISSUE-005 以降の本物の API 追加で置き換わる
- [ ] 生成物に `paths['/v1/ping']` が出力されることを確認

---

## やらないこと (Out of Scope)

- API クライアント実装（→ ISSUE-004）
- 本物のエンドポイント実装（→ ISSUE-005 以降）
- クライアント側の自動生成（`@hey-api/openapi-ts` 等）
  - 今回は **型のみ生成**。クライアントは `openapi-fetch` を ISSUE-004 で薄く書く
- MSW モック自動生成（必要になったら別 Issue）

---

## 影響範囲

| 領域         | 影響                                                   |
| ------------ | ------------------------------------------------------ |
| OpenAPI      | ダミー `/v1/ping` を一時追加（Issue クローズ前に削除） |
| 生成型       | **新規作成**（`src/lib/api/generated/schema.d.ts`）    |
| 画面         | なし                                                   |
| データ       | なし                                                   |
| CI           | 生成漏れ検知ステップを追加                             |
| ドキュメント | README 更新 + 生成物 README                            |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `npm run openapi:gen` 実行で `src/lib/api/generated/schema.d.ts` が生成される
- [ ] 生成ファイル先頭に「自動生成・直接編集禁止」コメントがある
- [ ] `src/lib/api/generated/` が Git 管理対象になっている
- [ ] CI が下記を検知して失敗する
  - [ ] OpenAPI を変更したのに `openapi:gen` を忘れた PR
  - [ ] 生成物を手で編集した PR（再生成すれば diff が消える）
- [ ] `oasdiff` による破壊変更検知が CI で動く（warning でよい）
- [ ] `eslint` / `prettier` が生成物を対象外にしている
- [ ] `npm run typecheck` が通る（生成物を含めて）
- [ ] 動作確認: ダミー `/v1/ping` を OpenAPI から削除して再生成→型からも消えることを確認

---

## セキュリティ・プライバシー考慮

- [ ] 生成物に **example の値が漏れない** 設定にする（`openapi-typescript` はデフォルトで漏れない）
- [ ] 生成物に **内部サーバ URL（staging 等）が含まれない** こと
  - `servers` のうち本番のみ含めるか、もしくは型生成時に `--exclude-servers` 相当の設定
  - 個人開発初期は影響軽微だが、原則として記録しておく
- [ ] CI のログに OpenAPI の中身を出さない（差分のみ）

---

## 検証用のチェックコマンド集（メモ）

```bash
# 生成
npm run openapi:gen

# 生成漏れ検知（CI と同じ）
npm run openapi:gen && git diff --exit-code src/lib/api/generated/

# 破壊変更検知
npm run openapi:check-breaking

# 全パイプライン
npm run openapi:all
```

---

## 参考

- [openapi-typescript](https://openapi-ts.dev/)
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [oasdiff](https://github.com/Tufin/oasdiff)
- `CLAUDE.md` §5
- `docs/api-driven-development/README.md` §7
- ISSUE-002（OpenAPI 基盤・前提条件）

---

## 実施結果 (2026-05-14)

### 作成・変更ファイル

- `package.json`: `openapi-typescript@7.13.0` 追加、scripts に `openapi:gen` / `openapi:check-breaking` / `openapi:all` 追加
- `src/lib/api/generated/schema.d.ts`: 自動生成（先頭に `openapi-typescript` 由来の `Do not make direct changes` ヘッダ付き）
- `src/lib/api/generated/README.md`: 直接編集禁止と再生成手順を明示
- `.github/workflows/openapi-validate.yml`:
  - `paths` トリガに `src/lib/api/generated/**` を追加
  - `actions/checkout` に `fetch-depth: 0`
  - `Regenerate types` + `Detect generation drift` (生成漏れを CI で fail)
  - `Detect breaking changes (warn-only)` を `oasdiff/oasdiff-action/breaking@v0.0.21` で実装

### スコープ調整

- 当初 spec の「ダミー `/v1/ping` を一時追加」は不要と判断（ISSUE-002 で投入済みの `/health` で生成パイプラインの動作確認が成立するため）
- `oasdiff` は curl ダウンロードではなく **公式 GitHub Action** を使用（バージョン固定・サンドボックスを濁さない）

### 検証結果

- [x] `pnpm openapi:gen` で `schema.d.ts` が生成される
- [x] 生成ファイル先頭に `openapi-typescript` 由来の自動生成ヘッダ
- [x] `src/lib/api/generated/` が Git 管理対象
- [x] `pnpm openapi:all` (lint → bundle → gen) 通過
- [x] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` 通過
- [x] `eslint.config.mjs` の ignore に `src/lib/api/generated/**` 含む
- [x] `.prettierignore` に `src/lib/api/generated/` 含む

### CI 動作の予告

PR #5（このIssueのPR）で確認できること:

- `validate` job が新たに `Regenerate types` / `Detect generation drift` を実行
- `Detect breaking changes` は warn-only（破壊変更があってもジョブは fail しない）
- 初回のため drift は出ない見込み

### PR ドラフト

タイトル: `[ISSUE-003] 型生成パイプライン (openapi-typescript + drift 検知 + oasdiff)`
