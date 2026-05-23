---
id: ISSUE-007
title: 子どもプロフィール API (children) + /onboarding 画面
priority: P0
status: done
size: M
created_at: 2026-05-23
merged_at: 2026-05-23
pr: 18
---

## 目的 (Why)

リソース API の **第一弾** として `Child` ドメインを完成させる。
OpenAPI → 型生成 → Prisma → Route Handler → Onboarding 画面まで「API 駆動開発の縦割り」を最初に通し、ISSUE-008 (Storage) / ISSUE-009 (Memory) / ISSUE-010 (AI) の **参考実装** とする。

PRD MVP の核 (写真→AI→30秒で記録) を成立させるため、その前提となる「子ども情報」を最初に登録できるようにする。

---

## スコープ (What)

### OpenAPI

- [ ] `docs/openapi/components/schemas/Child.yaml` — Child schema (id/name/birthdate/avatar_url/created_at/updated_at)
- [ ] `docs/openapi/components/schemas/ChildListResponse.yaml` — MVP は data 配列のみ、cursor は v1 で追加
- [ ] `docs/openapi/components/schemas/ChildCreateRequest.yaml`
- [ ] `docs/openapi/components/schemas/ChildUpdateRequest.yaml`
- [ ] `docs/openapi/components/responses/Conflict.yaml` に `child_limit_reached` example 追加
- [ ] `openapi.yaml` に paths `/children` (GET/POST) と `/children/{childId}` (GET/PUT) を inline 追加
- [ ] `.spectral.yaml` の `hana-path-lowercase` を `{childId}` (camelCase パスパラメータ) を許容する正規表現に修正

### DB (Prisma)

- [ ] `Child` model 追加 (id/userId/name/birthdate/avatarUrl/timestamps/deletedAt)
- [ ] `Profile.children` リレーション逆方向
- [ ] migration: `20260523033825_add_children`
  - `children` テーブル作成 + FK to `profiles.id` (Cascade)
  - **partial unique index** `(user_id) WHERE deleted_at IS NULL` を migration SQL に手書き追加 (ADR-0008)

### Server (Route Handler)

- [ ] `src/server/api/problems.ts` — ProblemDetails ビルダー共通化 (unauthorized/forbidden/notFound/validation/childLimitReached)
- [ ] `src/server/auth/current-user.ts` を `problems.ts` に依存させる (重複削除)
- [ ] `src/features/children/view-models/child.ts` — DB Child → API Child shape 変換
- [ ] `src/features/children/server/parse.ts` — body validation (zod 不採用、インライン)
- [ ] `src/app/v1/children/route.ts` — GET (list), POST (create)
- [ ] `src/app/v1/children/[childId]/route.ts` — GET, PUT
- [ ] 認可: `requireUser` + `child.userId !== user.id` で `forbidden` を throw

### UI

- [ ] `src/app/onboarding/page.tsx` — Client Component
  - shadcn Card / Button / Input / Label を使う
  - name + birthdate のフォーム
  - POST /v1/children → success: `router.push('/')`
  - 401 → `/sign-in` へ
  - 409 `child_limit_reached` → 「すでに 登録済み」+ ホームへ
  - 422 → field error 表示

### テスト

- [ ] `tests/unit/features/children/parse.test.ts` — 入力バリデーション (8 件)
- [ ] `tests/unit/features/children/view-model.test.ts` — DB → API 変換 (3 件)
- [ ] `tests/integration/v1/children.test.ts` — 4 endpoint × 認証/認可/エラー網羅 (12 件)

### ドキュメント / ADR

- [ ] ADR-0008: MVP 1 ユーザー 1 子ども制約 (defense-in-depth + partial unique index)
- [ ] このIssueファイル

---

## やらないこと (Out of Scope)

- `DELETE /v1/children/{childId}` (退会 ISSUE-016 で扱う)
- `avatar_url` の **アップロード** 機能 (ISSUE-008 Storage で実装)。フィールドだけ用意・null 固定
- 複数子ども対応 (v1 で外す)
- 子ども切替 UI (Bottom sheet 等)
- `/settings/children` 編集画面 (ISSUE-007a で後追い候補)
- middleware で `/onboarding` への自動誘導 (将来 Issue)
- `age_days` / `memory_count` 等の派生フィールド (client 計算 or 別 ISSUE)
- `gender` 列 (PRD §10 で「使わない設計も検討」、MVP では含めない)

---

## 設計判断

### body の `birthdate` は `format: date` (YYYY-MM-DD)

`date-time` ではなく `date`。タイムゾーン依存の月齢ズレを避ける。
Prisma の `@db.Date` と一致する。

### `avatar_url` を OpenAPI に含めるが ISSUE-008 まで null 固定

理由: 後で OpenAPI を変更する破壊リスクを今のうちに回避。ISSUE-008 で Storage が実装されたときに API を変えずに済む。

### `/v1/children/{childId}` の他人リソースは 403 (404 ではない)

理由: V0 prompt §1「Album not feed」 + Hana の信頼設計。情報を隠す動機がない (ID は漏洩リスクが低い UUID で、列挙不可能)。
ユーザー (親) には「権限がない」と明示的に伝える方が誠実。

### MVP 1 ユーザー 1 子ども制約は **アプリ層 + DB partial unique** で両層担保

詳細は ADR-0008。

### body validation は zod 不採用、インライン

理由: ISSUE-007 単体で導入すると依存ツリーへの影響範囲を判断しづらい。
将来複数 ISSUE で必要になったら zod 採用を検討 (別 ADR)。
今回のスコープでは parse.ts に閉じたインラインで十分。

### `.spectral.yaml` の `hana-path-lowercase` 正規表現修正

`{childId}` のような OpenAPI パスパラメータ部 (中括弧内) は除外する。
openapi-style-guide.md §3 で「パスパラメータは camelCase」と既に決めているため、ルール側が間違っていた。

---

## 影響範囲

| 領域         | 影響                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| OpenAPI      | Child / ChildListResponse / ChildCreateRequest / ChildUpdateRequest schema + 4 paths 追加  |
| 生成型       | `paths['/children']`, `paths['/children/{childId}']`, `components['schemas']['Child']` 等  |
| データ       | `children` テーブル新規 + `profiles.children` リレーション                                 |
| 画面         | `/onboarding` 新規                                                                         |
| 認証         | 既存 `requireUser` を使用。`current-user.ts` を `problems.ts` に依存させる軽微なリファクタ |
| CI           | typecheck / lint / build / format / test 全て通る                                          |
| ドキュメント | ADR-0008 / このIssueファイル                                                               |
| 環境変数     | なし                                                                                       |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm openapi:all` グリーン
- [ ] `pnpm typecheck` グリーン
- [ ] `pnpm lint` グリーン
- [ ] `pnpm format:check` グリーン
- [ ] `pnpm build` 成功 (`/onboarding`, `/v1/children`, `/v1/children/[childId]` 全 route)
- [ ] `pnpm test` 既存 32 + 新規 23 = 55 件パス
- [ ] `pnpm db:migrate` で `children` テーブル + partial unique index が作成される (手動確認)
- [ ] 認証なし `/v1/children` → 401
- [ ] 他人の `/v1/children/{childId}` → 403
- [ ] 存在しない childId → 404
- [ ] 1 件登録済みで 2 件目 POST → 409 `child_limit_reached`
- [ ] `/onboarding` から実際の API で子どもプロフィールが登録できる (手動確認)
- [ ] ADR-0008 accepted

---

## セキュリティ・プライバシー考慮

- [ ] **ログに子どもの名前を出さない**: Route Handler のロガーは existing `ApiLogger` 経由。allowlist 方式で `name` フィールドは記録しない
- [ ] **AI への送信は ISSUE-010 で扱う**: 本Issue では name/birthdate を AI に送らない
- [ ] **他ユーザーリソースへの 403**: 認可テストで担保
- [ ] **PII を含むエラーメッセージを返さない**: detail はテンプレ文字列のみ。`childId` を含まない
- [ ] **partial unique index の race condition**: P2002 を 409 に正規化、エラー文に DB の内部情報を含めない
- [ ] **論理削除**: `deleted_at` で柔らかく消す。30 日後の物理削除ジョブは別 Issue で

---

## 動作確認手順

```bash
# 1. 依存生成 & migration 適用
pnpm install
pnpm db:migrate

# 2. dev サーバ
pnpm dev

# 3. サインインしてから /onboarding を開く
# → http://localhost:3000/sign-in → Google → http://localhost:3000/onboarding
# 4. 「はると」「2026-01-13」を入力して つづける
# → / にリダイレクト

# 5. /onboarding に戻ると 409 が返り「すでに 登録済み」表示
# 6. curl で API も確認
TOKEN=$(...)  # Supabase session token を localStorage から
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/children
```

---

## 参考

- ISSUE-006 (Supabase Auth) — 認証基盤
- ISSUE-006c (デザインシステム) — Card / Button / Input / Label
- `Hana_PRD_v1.md` §10 データ設計
- `Hana_PRD_v1.md` §11 API 設計
- ADR-0008 (1 ユーザー 1 子ども制約)
- `docs/design/v0-prompt.md` §5.1 オンボーディング Step 2
- `docs/api-driven-development/openapi-style-guide.md`
- `docs/api-driven-development/error-format.md`
