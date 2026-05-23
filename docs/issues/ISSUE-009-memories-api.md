---
id: ISSUE-009
title: 記録 (Memory) API + /record + /album 画面
priority: P0
status: review
size: M+
created_at: 2026-05-23
---

## 目的 (Why)

Hana の中核体験「30秒で記録」の **本体フロー** を完成させる:

```
写真選択 → EXIF削除 (Canvas) → presigned URL 発行 → 直接 PUT → confirm
→ タイトル + 本文を手動入力 → POST /memories → /album で確認
```

ISSUE-010 (AI 生成) はこのフローの **本文ステップを AI 提案に置き換える** だけで済むよう、本Issue で土台を完成させる。

---

## スコープ (What)

### OpenAPI

- [ ] Memory / MemoryListResponse / MemoryCreateRequest / MemoryUpdateRequest schema
- [ ] ImageUrlResponse schema
- [ ] paths:
  - `GET /memories` (cursor pagination)
  - `POST /memories`
  - `GET /memories/{memoryId}`
  - `PUT /memories/{memoryId}` (title/body/weather/is_favorite を部分更新)
  - `DELETE /memories/{memoryId}` (論理削除)
  - `GET /uploads/{imageId}/url` (signed download URL)

### DB (Prisma)

- [ ] Memory model + Profile.memories / Child.memories リレーション
- [ ] migration `add_memories`:
  - memories テーブル
  - composite index `(user_id, recorded_at DESC, id DESC)` でカーソル走査を高速化
  - `images.memory_id` への FK (ON DELETE SET NULL)
- [ ] Image.memory リレーション逆方向

### Server

- [ ] `src/features/memories/server/parse.ts` — body / query 検証 + cursor encode/decode
- [ ] `src/features/memories/view-models/memory.ts` — DB → API + image_ids 並び替え
- [ ] `src/app/v1/memories/route.ts` — GET (list), POST
  - POST はトランザクション内で memory 作成 + image 紐付け
  - image の所有権 + 未紐付け検証
- [ ] `src/app/v1/memories/[memoryId]/route.ts` — GET, PUT, DELETE
- [ ] `src/app/v1/uploads/[imageId]/url/route.ts` — signed download URL (TTL 1800s)

### UI

- [ ] `src/app/record/page.tsx` — Client Component
  - 子ども未登録 → /onboarding へ案内
  - 写真選択 → Canvas で再エンコード (EXIF 削除) → presigned URL → PUT → confirm
  - タイトル + 本文 (任意) + 日付 + 天気 (任意)
  - POST /memories → 成功画面 1.5s → /album へ
- [ ] `src/app/album/page.tsx` — Client Component
  - 一覧 (テキストのみ、サムネは将来 ISSUE)
  - 空状態 → /record への誘導

### テスト (新規 50 件以上)

- [ ] `tests/unit/features/memories/parse.test.ts` (~20 件)
- [ ] `tests/unit/features/memories/view-model.test.ts` (~3 件)
- [ ] `tests/integration/v1/memories.test.ts` (~15 件)
  - 401/403/404/422/200/201/204 + cursor + 認可

### ドキュメント

- [ ] ADR-0010: Memory 設計とカーソルページネーション
- [ ] このIssueファイル

### kazuya 側の手動セットアップ

- [ ] `pnpm db:migrate` で memories テーブル + images.memory_id への FK を適用

---

## やらないこと (Out of Scope)

- **AI 生成統合** → ISSUE-010
- **画像 thumbnail / サムネイル付き timeline** → 別 ISSUE (polish)
- **memory detail 画面** (写真表示 + 詳細) → 別 ISSUE (polish)
- **月別ふりかえり** → 別 ISSUE
- **検索 / フィルタ / タグ** → 別 ISSUE (v2)
- **画像の並び替え** (`order_index` カラム) → 必要になったら別 ISSUE
- **複数子ども対応** → v1
- **画像複数紐付け** (1 image を複数 memory に) → 中間テーブル化、必要なら v1
- **論理削除の復元 API** → 別 ISSUE (30 日復元 UX 実装時)
- **storage の cleanup ジョブ** → 別 ISSUE

---

## 設計判断

### 1:N は `images.memory_id` (nullable) で表現

詳細は ADR-0010 §1。

### POST /memories は 2 段階検証 + トランザクション

- step 1: child_id 所有権
- step 2: image_ids の所有権 & 未紐付け検証
- step 3: `$transaction` で memory.create + image.updateMany (WHERE memoryId IS NULL で race-safe)

詳細は ADR-0010 §2。

### カーソル形式は `base64url(JSON.stringify({ id }))`

Prisma の `cursor: { id }` でそのまま使える。並び順は `recorded_at DESC, id DESC` で安定。

詳細は ADR-0010 §3。

### DELETE は論理削除のみ、画像は残す

詳細は ADR-0010 §4。退会時の Cascade で最終クリーンアップ。

### EXIF はクライアント側で削除 (ADR-0009 §4 再掲)

Canvas API で再エンコード = EXIF 自動消失。PNG は PNG のまま、その他は JPEG 92% に正規化。

### 認可は Route Handler 層

`requireUser` + memory.userId / child.userId / image.userId の所有権比較 → 不一致なら 403。
他人リソースは 403 (404 で隠さない) — ISSUE-007 と同じポリシー。

---

## 影響範囲

| 領域         | 影響                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| OpenAPI      | Memory / MemoryListResponse / MemoryCreateRequest / MemoryUpdateRequest / ImageUrlResponse schema + 6 paths |
| 生成型       | paths['/memories'], paths['/memories/{memoryId}'], paths['/uploads/{imageId}/url'] と各 schema              |
| データ       | `memories` テーブル新規 + `images.memory_id` FK 追加 + 各リレーション                                       |
| 画面         | `/record` / `/album` 新規                                                                                   |
| 認証         | 既存 `requireUser` を使用                                                                                   |
| CI           | typecheck / lint / format / build / test 全グリーン                                                         |
| ドキュメント | ADR-0010 + このIssueファイル                                                                                |
| 環境変数     | なし                                                                                                        |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm openapi:all` グリーン
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 既存 105 + 新規 50+ = 150+ 件パス
- [ ] `pnpm db:migrate` で `memories` テーブル + `images.memory_id` FK が作成される (手動)
- [ ] curl で 6 endpoint が動く (手動)
- [ ] `/record` で「写真 1 枚 → タイトル + 本文 → 保存」が動く (手動)
- [ ] `/album` で保存した記録が表示される (手動)
- [ ] 削除 → /album から消える (手動)
- [ ] 認証なし / 他人リソース / 不正 UUID / 不正 body が適切に 401/403/404/422 を返す (テスト)
- [ ] ADR-0010 accepted

---

## セキュリティ・プライバシー考慮

- [ ] **PII を API レスポンスに含めない**: storage_key は引き続き非公開 (ISSUE-008 の方針継続)
- [ ] **本文 (body) のログ禁止**: AI 生成本文ではないが、ユーザーが書いた個人的な記録なので扱いは同じ
- [ ] **他人 memory への 403**: 認可テストで担保
- [ ] **削除済み memory への GET/PUT/DELETE → 404**: `deleted_at IS NOT NULL` フィルタで除外
- [ ] **memory_id を含むエラーメッセージは出さない**: detail はテンプレ文字列のみ
- [ ] **signed download URL のログ禁止**: 一時的とはいえ認証情報を含む
- [ ] **Canvas 再エンコードで EXIF 削除**: 位置情報・撮影機種を意図せず保存しない

---

## 動作確認手順

```bash
# 1. migration
pnpm db:migrate

# 2. dev サーバ
pnpm dev

# 3. ブラウザフロー
#    /sign-in → Google → /onboarding (もし未登録なら) → /record
#    写真を選ぶ → アップロード完了を待つ → タイトル入力 → のこす
#    成功画面 (1.5s) → /album で記録が表示される

# 4. PUT で更新
curl -X PUT http://localhost:3000/v1/memories/<id> \
  -H "Content-Type: application/json" \
  -H "Cookie: <sb-*>" \
  -d '{"is_favorite":true}'

# 5. DELETE で論理削除
curl -X DELETE http://localhost:3000/v1/memories/<id> \
  -H "Cookie: <sb-*>"
# → 204 + /album から消える
```

---

## 参考

- ISSUE-006 (Auth) / ISSUE-006c (デザイン) / ISSUE-007 (Children) / ISSUE-008 (Storage)
- `Hana_PRD_v1.md` §6 / §10 / §11
- ADR-0007 / ADR-0008 / ADR-0009 / ADR-0010 (本Issue)
- `docs/design/v0-prompt.md` §5.3 (記録作成) / §5.4 (タイムライン)
