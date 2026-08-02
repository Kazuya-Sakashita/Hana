# ADR-0009: 写真ストレージ設計 (Supabase Storage + presigned URL)

- 状態: Accepted
- 決定日: 2026-05-23
- 更新日: 2026-08-02 (ISSUE-141: 未confirm画像cleanup用の予約を追加)
- 対象 Issue: ISSUE-008

## 背景

Hana では子どもの写真を扱う。CLAUDE.md §7 で以下が宣言されている:

- パブリック URL で公開しない
- Presigned URL（デフォルト 30 分）経由でのみアクセス
- `Cache-Control: private, no-store`
- `storage_key: uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}`
- アップロード時にサーバ側で EXIF を削除

これらを「どう実装に落とすか」を ADR で明文化し、後続 ISSUE が同じ判断を踏襲できるようにする。

## 決定

### 1. Storage は Supabase Storage を採用

代替案: S3 / Cloudflare R2 / Bunny CDN。

採用理由:

- ADR-0004 で Supabase をマネージド基盤として採用済み
- Auth と Storage の認可情報を 1 プロジェクトで共有できる
- presigned URL API が SDK レベルで揃っている (`createSignedUploadUrl` / `createSignedUrl`)
- private bucket / cache policy が UI から設定可能

受容コスト: Supabase の Storage 料金体系 (容量 + 帯域)。MVP の規模では Free tier で十分。

### 2. アップロードは Presigned URL 方式 (サーバ経由しない)

代替案: クライアント → Next.js Route Handler → Storage (サーバ経由 PUT)

採用理由:

- Vercel Functions の body size 制約 (4.5 MB) を回避
- サーバの帯域コストを払わない
- 大量同時アップロードでスケールしやすい
- PRD §11 API 設計の通り

### 3. Presigned URL のフロー: 「発行 → 直接 PUT → 確認」の 3 ステップ

```
client                            server                              storage
  │  POST /uploads/presigned-url    │
  ├────────────────────────────────►│  generateStorageKey()
  │                                 │  create UploadReservation
  │                                 │  createSignedUploadUrl()
  │  ◄─── { presigned_url, key } ───┤
  │  PUT (画像本体)                                                        │
  ├───────────────────────────────────────────────────────────────────────►│
  │  POST /uploads/confirm                                                 │
  ├────────────────────────────────►│  validate key prefix
  │                                 │  prisma.image.create()
  │  ◄─── 201 { id, ... } ──────────┤
```

- presigned-url 発行前に`UploadReservation`を作成し、発行から48時間後をcleanup期限として記録する
- confirm時は同じstorage keyのtransaction advisory lockを取得し、`Image`作成後に予約を削除する
- confirmが呼ばれなかった場合は、ISSUE-141のcronが予約、所有prefix、Storage更新時刻、`Image`不存在をlock内で再確認し、original / thumbnail / previewの既知3 keyだけを削除する
- 予約作成に失敗した場合はsigned URLを発行せず、追跡不能なobjectを新たに作らない

### 4. EXIF 削除はクライアント側とconfirm時のサーバー側で行う

CLAUDE.md §7 「アップロード時にサーバ側で EXIF を削除」と方針が異なるが、MVP では:

- ブラウザの Canvas API で再エンコードすると **副作用で EXIF が消える** (位置情報・撮影機種等)
- サーバ側で削除するには Storage からダウンロード → 加工 → 再アップロードが必要で、Function の実行時間と帯域コストが膨らむ
- 信頼境界としては「クライアントが正しく削除した前提」だが、Hana のユーザーは自身のため、悪意ある混入の動機が低い

ISSUE-137以降は、クライアント処理を多層防御として残しつつ、confirm時にサーバー側でも
orientation反映と再エンコードを行い、originalをmetadataなしの画像へ置換する。

- JPEG: quality 90 / mozjpeg
- PNG: compression level 9
- WebP: quality 90
- 再エンコードまたはoriginal置換に失敗した場合はImage行を作成しない
- thumbnail / previewも置換後のsanitized originalから生成する
- 再エンコード後にも10 MiB上限を適用する
- `images.metadata_sanitized_at` がnullのoriginalにはsigned URLを発行しない
- 既存の有効画像は、識別子を出力しないdry-runで件数確認後、明示的なapplyで冪等に再処理する
- 展開順はDB migration → 新コード → signed URL TTL（30分）経過 → backfill applyとし、
  既発行URLの有効期間が終わってから実ユーザー原画像を置換する

### 5. Signed URL TTL

| 用途             | TTL                       | 由来                                                                                                               |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **アップロード** | Supabase 既定 (約 2 時間) | `createSignedUploadUrl` は TTL 指定をサポートしない                                                                |
| **ダウンロード** | 30 分                     | `PRESIGNED_URL_TTL_SECONDS` (`.env.example` のコメント) と CLAUDE.md §7 が一致。`createSignedUrl(path, 1800)` 想定 |

ダウンロード API は本 Issue ではまだ作らない (ISSUE-009 Memory 画面で必要)。
本 ADR でルールだけ宣言。

### 6. storage_key 形式: `uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}`

- `userIdHash`: SHA-256(user_id) の先頭 16 文字 — user_id 自体を URL に露出しない
- `yyyymm`: アップロード時の UTC 年月 — 月単位の cleanup ジョブで論理的に処理しやすい
- `uuid`: ランダム UUID v4 — 推測不可能
- `ext`: content_type から導出 (`jpg` / `png` / `webp` / `heic` のみ)

検証:

- 発行: `generateStorageKey(userId, mime)` で組み立て
- 確認: `isValidStorageKey(key)` で正規表現マッチ、`storageKeyBelongsToUser(key, userId)` で prefix 照合

### 7. PII を API レスポンスから除外

`Image` schema は `storage_key` を **含めない**:

- CLAUDE.md §7 のログ禁止リストに `storage_key` がある
- API レスポンス → ログ → モニタリングで漏れるリスクを構造的に排除
- ダウンロード用 signed URL は別途 `GET /uploads/{imageId}/url` で発行する (ISSUE-009 で実装予定)

### 8. content_type ホワイトリスト

許可: `image/jpeg` / `image/png` / `image/webp` / `image/heic`

- HEIC は iPhone の標準形式。MVP のターゲット (0–3歳児の母親) は iPhone 利用率が高い前提
- 動画系 (mp4 / mov) は OUT (MVP では動画非対応・PRD §6)
- それ以外は 422 `unsupported_media_type`

### 9. file_size 上限 10 MiB

- iPhone の HEIC で 1 枚 ~2–4 MB、JPEG で 1–3 MB
- 10 MiB 上限で多くの実用範囲をカバー
- 上限超過は **クライアント側で先に弾く** ことを推奨。サーバ側は最終防衛線
- Supabase Storage の bucket 設定 (file size limit) も同じ値に揃える

### 10. 退会時の物理削除

- `images` テーブルは `profiles.id` への FK Cascade
- ただし **Storage 上のオブジェクトは Cascade されない**
- 退会フロー (ISSUE-016) で:
  1. `images` 行から `storage_key` 一覧を取得
  2. Supabase Storage で一括削除 (`remove([])`)
  3. その後 `profiles` 削除 (Cascade で `images` 行も消える)

## 採用した代替案

### ❌ サーバ経由 PUT (multipart/form-data)

理由: Vercel Functions の body size 制約、帯域コスト、スケーラビリティ。

### ❌ Cloudinary / imgix 等の外部画像 SaaS

理由: 別契約・料金体系を増やす価値が MVP では薄い。Supabase Storage で十分。

### ❌ Storage の object policy で RLS

理由: Phase 1 では Storage Policy は public-bucket=false のみ。RLS は Phase 2 (ADR-0007 と同じ判断軸)。
アプリ層で storage_key prefix を検証することで認可を担保。

## 受容コスト

- **Storage 側の orphan files**: confirm 未到達のアップロードファイルが Storage に残る。
  対策: 定期 cleanup ジョブ (将来 ISSUE)
- **再エンコードの帯域と実行時間**: confirm時にoriginalのdownloadと再uploadが必要。
  対策: 10 MiB / 25 MP上限、Storage timeout、失敗時のImage未確定で制御する
- **storage_key の偽造防止**: `isValidStorageKey` + `storageKeyBelongsToUser` で防ぐが、
  prefix 自体は user_id を SHA-256 で出しただけなので、user_id を知られると prefix も計算できる。
  ただし user_id は Bearer JWT の中にあり、外部に流出しない設計。

## 関連

- ISSUE-008: 写真アップロード + Supabase Storage
- ISSUE-141: 未confirm画像の期限後cleanup
- ISSUE-009 (未着手): Memory API + 画像ダウンロード signed URL
- ISSUE-016 (未着手): 退会フロー + Storage 物理削除
- ADR-0004: Supabase をマネージド基盤に採用
- ADR-0007: 認可は Route Handler 層 / RLS は Phase 2
- `Hana_PRD_v1.md` §10 / §11 / §12
- `CLAUDE.md` §7 セキュリティ・プライバシー
