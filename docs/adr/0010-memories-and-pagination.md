# ADR-0010: 記録 (Memory) の設計とカーソルページネーション方式

- 状態: Accepted
- 決定日: 2026-05-23
- 対象 Issue: ISSUE-009

## 背景

ISSUE-009 で Memory (記録) ドメインを実装するにあたり、以下の設計判断を明文化する:

- Memory と Image のリレーション (1:N) の表現
- カーソルページネーションの符号化方式
- POST /memories のトランザクション境界
- DELETE の論理削除と画像の扱い
- AI 生成と手動入力の同居 (本Issueでは `ai_generated: false` 固定)

## 決定

### 1. Memory と Image は **1:N**、紐付けは `images.memory_id` (nullable)

代替案: 中間テーブル `memory_images`

採用理由:

- PRD §10 では `memory_images` だが、Image は MVP では 1 つの Memory にしか所属しない
- 中間テーブル不要、`images.memory_id` (nullable + ON DELETE SET NULL) でシンプル
- 画像の表示順は `images.created_at` の昇順 = アップロード順とする (UI で先に選んだものが先)
- v1 で「同じ画像を別の Memory にも紐付けたい」というニーズが出たら中間テーブルに移行

### 2. POST /memories は **2 段階の検証 + トランザクション**

```
1. child_id の所有権チェック (3xx 404/403)
2. image_ids の所有権 & 未紐付けチェック
   - 一部が見つからない → 422 image_not_found
   - 他人の画像 → 403 forbidden
   - 既に別 Memory に紐付け → 422 already_linked
3. $transaction で:
   a. memory.create
   b. image.updateMany で memory_id を一括セット
   c. memory.findUniqueOrThrow で images を含めて返す
```

採用理由:

- 検証は楽観的 (検証後の race を排除しないが、後段で DB level で防げる)
- `updateMany` の `WHERE memoryId IS NULL` で race-safe 更新 (他者が先に紐付けたら count が減るだけ)
- 並行リクエストで「同じ画像を 2 つの Memory に同時紐付け」は `memoryId IS NULL` の where 条件で物理的に排除される

### 3. カーソル形式: `base64url(JSON.stringify({ id }))`

```
cursor = base64url({"id": "7d6e5f4c-3b2a-4291-8765-0123456789ab"})
```

採用理由:

- 並び順は `recorded_at DESC, id DESC` で安定
- Prisma の `cursor: { id }` でそのまま使える (id は composite index に含まれる)
- `recorded_at` 自体は cursor に入れなくても、Prisma が `id` を起点に正しく後続を取得
- 将来 `recorded_at + id` の複合 cursor が必要になったら JSON フィールドを追加 (後方互換)

代替案:

- Offset ベース: 大規模化で遅い・items 挿入で重複/欠落
- ID 文字列のみ: 並び順が `id` 順だと UX が崩れる

### 4. DELETE /memories は **論理削除**、画像はそのまま残す

- `memories.deleted_at` セットのみ。`images.memory_id` は変更しない
- 30 日後の物理削除ジョブで `memories` 行も画像 (storage + DB) も一括削除する想定 (別 ISSUE)
- 「やり直し」UX のため、30 日以内は復元 API で復活可能 (将来 ISSUE)
- 退会フロー (ISSUE-016) では Cascade で全部消える

採用理由:

- 親が誤って削除した場合の安全網
- 画像を即削除しないことで、復元時に同じ画像が見える

### 5. `ai_generated` フィールドは boolean、ISSUE-009 では常に false

- 本Issueは手動入力フローのみ
- ISSUE-010 (AI 統合) で `true` を含む `POST /memories` が走るようになる
- API スキーマは今のうちに boolean 必須として確定し、ISSUE-010 で OpenAPI 変更が発生しないようにする

### 6. `recorded_at` は **date-only** (YYYY-MM-DD)、未来日付は拒否

- タイムゾーンによるズレを避ける (子どもの月齢計算と一致)
- 未来日付は `body.recorded_at` で `future_date` reason の 422
- 「今日」は許容する (今撮った写真をすぐ記録できる)

### 7. UI は MVP では `/record` 単独 + `/album` のテキストリスト

- サムネイル付きアルバム / 詳細画面 / 月別ふりかえりは別 ISSUE
- ISSUE-009 で「保存 → リストに並ぶ」のループが動くことを最重要視
- 画像ダウンロード signed URL (`GET /uploads/{imageId}/url`) は API として用意 (ISSUE-009 のリスト UI では未使用、将来 detail 画面で使う)

## 受容コスト

- **画像表示順**: `created_at` 昇順を使うため、後からアップロード順序を入れ替える API がない。必要なら `order_index` カラム追加 (別 ISSUE)
- **GET /memories の N+1**: 各 memory の `images` を `include` で取るが、Prisma が一括 SQL に最適化するので問題なし
- **cursor 不整合**: 並列で memory 追加されると cursor 位置がずれる (新規アイテムは次回 fetch で先頭に出る、cursor は古い位置を維持) — タイムライン UX としては受容
- **論理削除と画像 storage**: 削除済み memory でも images.storage_key は残るため、Storage コスト → 別 ISSUE の cleanup ジョブで対応

## 関連

- ISSUE-009: 記録 API + /record + /album
- ADR-0007 (認可は Route Handler 層) / ADR-0008 (1 ユーザー 1 子ども) / ADR-0009 (Storage)
- `Hana_PRD_v1.md` §10 / §11
- `docs/api-driven-development/error-format.md`
- `docs/design/v0-prompt.md` §5.3 (記録作成画面)
