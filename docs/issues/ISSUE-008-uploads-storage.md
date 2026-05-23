---
id: ISSUE-008
title: 写真アップロード + Supabase Storage (presigned URL 方式)
priority: P0
status: done
size: M
created_at: 2026-05-23
merged_at: 2026-05-23
pr: 20
---

## 目的 (Why)

ISSUE-009 (Memory) / ISSUE-010 (AI) で扱う **写真の保管基盤** を確立する。
Hana の中核体験「写真 1 枚から AI が記憶を物語にする」の前提となる。

CLAUDE.md §7 で宣言済みの方針 (private bucket / presigned URL / 推測不可能な storage_key) を
実装に落とし込み、後続 ISSUE が同じ縦割りパターンを踏襲できるようにする。

---

## スコープ (What)

### OpenAPI

- [ ] `Image` schema 追加 (id / memory_id / content_type / width / height / file_size / created_at)
  - **`storage_key` は API レスポンスに含めない** (PII)
- [ ] `PresignedUploadRequest` / `PresignedUploadResponse` / `UploadConfirmRequest` schema
- [ ] paths:
  - `POST /uploads/presigned-url` — signed URL 発行 (DB に書き込まない)
  - `POST /uploads/confirm` — Image レコード作成

### DB (Prisma)

- [ ] `Image` model (id / user_id / memory_id (nullable) / storage_key (unique) / content_type / width / height / file_size / timestamps / deleted_at)
- [ ] `Profile.images` リレーション
- [ ] migration `add_images`: テーブル + FK Cascade + index (user_id / memory_id) + storage_key unique
- [ ] **`memory_id` は nullable**。ISSUE-009 で memories テーブル作成時に FK を別 migration で張る

### Server

- [ ] `src/features/uploads/server/storage-key.ts`
  - `userIdHash` (SHA-256 → 16 chars)
  - `generateStorageKey` / `isValidStorageKey` / `storageKeyBelongsToUser`
  - `extensionForMime` / `mimeForExtension`
  - `ALLOWED_MIMES`: jpeg / png / webp / heic
- [ ] `src/features/uploads/server/parse.ts`
  - `parsePresignedUploadRequest` (file_name / content_type 検証)
  - `parseUploadConfirmRequest` (storage_key / dimensions / file_size 検証)
- [ ] `src/features/uploads/view-models/image.ts` — DB Image → API Image
- [ ] `src/app/v1/uploads/presigned-url/route.ts`
  - `requireUser` → key 生成 → Supabase `createSignedUploadUrl`
  - 失敗時はサーバログに詳細、クライアントには 500 generic
- [ ] `src/app/v1/uploads/confirm/route.ts`
  - `requireUser` → storage_key の形式と prefix を検証 → `prisma.image.create`
  - storage_key の prefix が他人 → 403
  - 形式不正 → 422
  - 同じ storage_key で 2 回 confirm → 422 `already_confirmed`

### kazuya 側の手動セットアップ

- [ ] Supabase ダッシュボードで private bucket `images` を作成
  - Public: **off**
  - File size limit: 10 MiB
  - Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- [ ] `pnpm db:migrate` で `images` テーブル適用

### テスト (新規 33 件 → 合計 97 件想定)

- [ ] `tests/unit/features/uploads/storage-key.test.ts` (18 件)
- [ ] `tests/unit/features/uploads/parse.test.ts` (12 件)
- [ ] `tests/integration/v1/uploads.test.ts` (8 件)
  - 401 / 422 / 403 / 200 / 500
  - PII (storage_key) がレスポンスに含まれないことを assert

### ドキュメント

- [ ] ADR-0009: 写真ストレージ設計 (presigned URL / EXIF クライアント責務 / TTL / storage_key 形式)
- [ ] このIssueファイル

---

## やらないこと (Out of Scope)

- **UI 実装** → ISSUE-009 (Memory 作成画面で写真選択フローと一体実装)
- **ダウンロード signed URL API** (`GET /uploads/{imageId}/url`) → ISSUE-009 (memory 表示で必要)
- **サーバ側 EXIF 削除** → ADR-0009 でクライアント責務を採用。Phase 2 で再検討
- **thumbnail 生成** → MVP は元画像のみ。必要なら別 ISSUE
- **Storage 上の orphan cleanup ジョブ** → 別 ISSUE (cron で月次)
- **画像署名検証** (アップロード後のメタデータ整合性) → 別 ISSUE
- **退会時の Storage 物理削除** → ISSUE-016
- **Storage RLS** → Phase 2 (ADR-0009 §3)

---

## 設計判断

### Presigned URL は **発行 → PUT → confirm** の 3 ステップ

詳細は ADR-0009。発行時には DB に書かず、confirm で初めて Image を作る (Q2 推奨)。

### EXIF はクライアント側で削除

詳細は ADR-0009 §4。MVP の判断、Phase 2 で見直し。

### content_type は 4 種ホワイトリスト

`image/jpeg` / `image/png` / `image/webp` / `image/heic`。
HEIC は iPhone のデフォルト形式で、ターゲット母親層の利用率に合わせる。

### storage_key は推測不可能で user_id を露出しない

`uploads/{SHA256(user_id)[:16]}/{yyyymm}/{uuid}.{ext}`。
詳細は ADR-0009 §6。

### 認可は Route Handler 層で

- presigned-url: `requireUser` で発行 (キーには SHA256(user_id) が含まれる)
- confirm: `requireUser` + storage_key の prefix が `uploads/{SHA256(currentUser.id)[:16]}/` に一致することを確認 → 不一致なら 403

ADR-0007 と同じ defense 思想。

### file_size 上限は OpenAPI / Prisma / parse / bucket で四重定義

10 MiB を四重定義することで、どこを通っても同じ上限が適用される。Supabase bucket policy が **最後の砦**。

---

## 影響範囲

| 領域         | 影響                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| OpenAPI      | Image / PresignedUploadRequest / PresignedUploadResponse / UploadConfirmRequest schema + 2 paths    |
| 生成型       | `paths['/uploads/presigned-url']`, `paths['/uploads/confirm']`, `components['schemas']['Image']` 等 |
| データ       | `images` テーブル新規 + `profiles.images` リレーション                                              |
| 画面         | **なし** (ISSUE-009 で扱う)                                                                         |
| 認証         | 既存 `requireUser` を使用                                                                           |
| CI           | typecheck / lint / format / test / build 全グリーン                                                 |
| ドキュメント | ADR-0009 + このIssueファイル                                                                        |
| 環境変数     | なし (既存 Supabase 環境変数を使用)                                                                 |
| 外部設定     | **kazuya 手動**: Supabase ダッシュボードで bucket `images` 作成                                     |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm openapi:all` グリーン
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 既存 64 + 新規 33 = 97 件パス
- [ ] `pnpm db:migrate` で `images` テーブル作成 (手動)
- [ ] Supabase ダッシュボードで bucket `images` 作成済み (手動)
- [ ] curl で `/v1/uploads/presigned-url` → `200 + presigned_url`
- [ ] PUT で実画像がアップロードできる (curl)
- [ ] curl で `/v1/uploads/confirm` → `201 + Image`
- [ ] 認証なし → 401
- [ ] 不正な content_type → 422
- [ ] 他人 prefix の storage_key で confirm → 403
- [ ] Image レスポンスに `storage_key` / `user_id` が含まれない (テスト)
- [ ] ADR-0009 accepted

---

## セキュリティ・プライバシー考慮

- [ ] **storage_key を API レスポンスに含めない** (PII / CLAUDE.md §7)
- [ ] **user_id を URL/storage_key に直接出さない** (SHA-256 ハッシュ経由)
- [ ] **presigned_url のログ禁止** (一時的とはいえ認証情報を含む)
- [ ] **bucket は private**、パブリック URL を絶対に発行しない
- [ ] **content_type ホワイトリスト** で `script` や任意拡張子を弾く
- [ ] **file_size 上限** 10 MiB (DoS 軽減)
- [ ] **退会時の Storage 物理削除** は ISSUE-016 で扱うことを ADR-0009 §10 に明記
- [ ] **EXIF (位置情報・撮影機種) の削除責任** は ADR-0009 §4 で「クライアント側」と明文化

---

## 動作確認手順

```bash
# 0. kazuya 側で 1 回
#    Supabase Dashboard → Storage → Create bucket 'images' (Private)
#    File size limit: 10 MiB
#    Allowed MIME: image/jpeg, image/png, image/webp, image/heic

# 1. migration 適用
pnpm db:migrate

# 2. dev サーバ
pnpm dev

# 3. サインインしてセッション cookie を取得 (ブラウザで /sign-in)
# 4. curl でテスト (cookie をブラウザからコピー)
curl -X POST http://localhost:3000/v1/uploads/presigned-url \
  -H "Content-Type: application/json" \
  -H "Cookie: <sb-...=...>" \
  -d '{"file_name":"test.jpg","content_type":"image/jpeg"}'
#  → { "presigned_url": "...", "storage_key": "uploads/.../202605/<uuid>.jpg", "expires_at": "..." }

# 5. 受け取った presigned_url に PUT
curl -X PUT "<presigned_url>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @./sample.jpg
#  → 200 OK

# 6. confirm
curl -X POST http://localhost:3000/v1/uploads/confirm \
  -H "Content-Type: application/json" \
  -H "Cookie: <sb-...=...>" \
  -d '{"storage_key":"uploads/.../<uuid>.jpg","width":1920,"height":1080,"file_size":524288}'
#  → 201 { "id": "...", "memory_id": null, "content_type": "image/jpeg", ... }
```

---

## 参考

- ISSUE-006 (Supabase Auth) — 認証基盤
- ISSUE-007 (children API) — 認可パターンの参考実装
- `Hana_PRD_v1.md` §10 (データ設計) / §11 (API 設計) / §12 (セキュリティ)
- `CLAUDE.md` §7 (画像セキュリティ / ログ禁止リスト)
- ADR-0009 (本Issue で起こす)
- [Supabase Storage docs — createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
