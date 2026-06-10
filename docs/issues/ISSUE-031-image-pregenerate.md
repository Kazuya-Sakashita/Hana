---
id: ISSUE-031
title: 画像 variant (thumbnail/preview) をアップロード時に sharp で事前生成
priority: P0
status: done
size: M
created_at: 2026-05-27
merged_at: 2026-06-10
pr: 46
parent: PERF
---

## 目的 (Why)

ISSUE-019 で実装した Supabase Storage Image Transformation (resize + WebP 変換) が **Supabase Free plan で silent fallback され機能しない** ことが ISSUE-028 検証で判明 (実測: 2.3〜3.7 MB JPEG 配信、 URL は `/object/sign/` で transformation 経由なし)。

Vercel Image Optimization 経由案 (ADR-0013 改訂版) も dev で macOS NAT64 問題により検証困難、 本番でも Hobby 1000 src/月制限が早期にネック化する見込み。

→ **plan / network / 課金に依存しない方式** が必要。 アップロード時に **sharp で 320 (thumbnail) + 1024 (preview) WebP variant を事前生成して Storage に保存** する。 配信時は variant key の signed URL を発行するだけ。

---

## スコープ (What)

### 設計

**Storage key 派生規則** (suffix-based):

| サイズ    | key 形式                                            | 用途                          |
| --------- | --------------------------------------------------- | ----------------------------- |
| original  | `uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}`        | (現状維持)                    |
| preview   | `uploads/{userIdHash}/{yyyymm}/{uuid}_preview.webp` | `/memory/[id]` 本画像         |
| thumbnail | `uploads/{userIdHash}/{yyyymm}/{uuid}_thumb.webp`   | `/album` / `/` carousel cover |

### サーバ修正

- [ ] `src/app/v1/uploads/confirm/route.ts`
  - Storage から original を download
  - sharp で 2 variant (thumb 320px q70 / preview 1024px q80) を生成
  - Storage に `Promise.all` で並列 upload
  - 失敗時は variant 無しで Image row だけ作成 (fallback 動作のため)
- [ ] `src/features/uploads/server/signed-url.ts`
  - `TRANSFORMS` 定数と transformation オプション削除
  - `deriveVariantKey(originalKey, size)` で派生 key を計算
  - `createSignedUrl(derivedKey, TTL)` (transform オプション無し)

### クライアント

- [ ] 修正なし (`size=thumbnail|preview|original` API はそのまま、 受け取る URL も同じ形)

### やらないこと

- 既存画像 (variant 未生成) の backfill → 別 ISSUE で必要なら対応。 MVP データのみなら手動で再アップロードでも可
- HEIC など特殊 format の特殊扱い → sharp が対応する範囲で
- AVIF 出力 → WebP のみ (sharp は AVIF 対応だが encoding 重い、 MVP は WebP で十分)
- Vercel Image Optimization 連携 → 本 ISSUE で plan 依存ゼロにするので不要

---

## 設計判断

### sharp は既存依存を再利用

`package.json` で `"sharp": "^0.34.5"` 既に導入済 (ISSUE-010 AI 画像 resize 用)。 新規依存なし。

### suffix-based key vs prefix-based

`uploads/abc/uuid_thumb.webp` (suffix) と `thumbnails/abc/uuid.webp` (prefix) を比較:

- suffix: 同じディレクトリに 3 種揃う、 一覧で関係性が明確、 削除/移動が一括
- prefix: namespace が分離、 量が多いとき bucket 内検索が楽
- **suffix を採用**: 画像数が中規模 (~数万件) で MVP には十分

### 既存画像との互換性

`signed-url.ts` で派生 key の signed URL を発行する際、 そのファイルが Storage に存在しなくても **API は signed URL を返す** (createSignedUrl は存在チェックしない)。 client が `<img onerror>` で原画にフォールバックする等は **本 ISSUE では入れない** (将来の polish)。 既存データは再アップロード推奨。

### 並列性

`Promise.all` で 2 variant を並列生成 + アップロード。 sharp は CPU bound、 Storage upload は I/O bound。 confirm レスポンスタイムへの影響: ~300〜800ms 増加見込み (現状 ~150ms → ~500〜1000ms)。 ユーザー体感は record の「ほぞん しています…」 で吸収。

### 失敗時の挙動

variant 生成 or upload が失敗しても、 **Image row は作成して 200 を返す**。 そうしないと:

- ユーザーから見ると「アップロード成功 → 突然失敗」 という体験になる
- original は既に上がっているので record はできる
- 後日 variant が無いと list/detail で fallback (404 → ❀ placeholder) が必要だが、 これは将来の polish

### 拡張子の扱い

original の拡張子 (.jpg/.png/.webp/.heic) は保ったまま、 variant は常に `.webp` を suffix で付与。 元 ext は捨てる:

- `uuid.jpg` → `uuid_thumb.webp` / `uuid_preview.webp`
- `uuid.heic` → 同上

deriveVariantKey 実装:

```ts
function deriveVariantKey(originalKey: string, variant: 'thumb' | 'preview'): string {
  const lastDot = originalKey.lastIndexOf('.')
  const base = lastDot >= 0 ? originalKey.substring(0, lastDot) : originalKey
  return `${base}_${variant}.webp`
}
```

---

## 影響範囲

| 領域         | 影響                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI      | なし (Memory.cover_thumbnail_url の意味は同じ)                                                                             |
| 生成型       | なし                                                                                                                       |
| データ       | Storage に variant 2 件追加 / 1 画像 (+ ~50KB × 2)                                                                         |
| 画面         | なし (透過的)                                                                                                              |
| API          | `POST /v1/uploads/confirm` (内部処理追加)<br>`GET /v1/uploads/{id}/url`, `GET /v1/memories` の signed URL 発行ロジック変更 |
| テスト       | confirm / uploads-url / memories test を sharp + 派生 key 対応に                                                           |
| CI           | typecheck / lint / format / build / test                                                                                   |
| ドキュメント | このIssueファイル + ADR-0013 を「sharp 事前生成方式採用」 に追記                                                           |
| 環境変数     | なし                                                                                                                       |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] 新規アップロード時に Storage に 3 ファイル (`*.{ext}` / `*_thumb.webp` / `*_preview.webp`) が生成される
- [ ] `/album` の cover_thumbnail_url が `*_thumb.webp` を指す
- [ ] `/memory/[id]` の preview URL が `*_preview.webp` を指す
- [ ] Network panel で WebP / 30〜100KB クラスの転送に
- [ ] confirm レスポンスタイム < 2s (CI で測れないなら手動)

---

## 動作確認手順

```bash
pnpm dev
# 1. /record で新規 memory を作成 (写真 1 枚)
# 2. Supabase ダッシュボード → Storage で 3 ファイル生成を確認
#    uuid.jpg / uuid_thumb.webp / uuid_preview.webp
# 3. /album を開いて Network panel
#    - cover_thumbnail_url が *_thumb.webp 指していること
#    - Transfer size 30〜100KB
#    - Content-Type: image/webp
# 4. /memory/{id} を開く → 本画像が *_preview.webp / Content-Type webp
# 5. Lighthouse mobile 再計測
```

---

## セキュリティ・プライバシー考慮

- [ ] sharp 処理時に **EXIF を確実に削除** (既存 ISSUE-010 resize.ts と整合、 .rotate() + 出力で剥がれる)
- [ ] variant の所有権チェックは original と同じ (派生 key は user prefix を継承)
- [ ] アップロード失敗時のログに storage_key を出さない (既存 allowlist 維持)

---

## リスク

- sharp の処理時間 → confirm レスポンスタイム劣化 → UI 側で「ほぞんしています」 を出している間に処理。 5MB 程度の写真で 500ms 程度を想定
- Storage 容量 3 倍 → Free plan の 1GB 上限への影響を要モニタ
- 既存画像 (variant なし) → list / detail で variant URL が 404、 client は ❀ placeholder にフォールバック (本 ISSUE では割り切る、 polish ISSUE で改善)

---

## 参考

- ISSUE-016 (perf baseline)
- ISSUE-019 (Supabase transformation 案、 本 ISSUE で置換)
- ISSUE-028 (next/image、 PR #44 保留中)
- ADR-0013 (本 ISSUE で改訂版を上書き予定)
- `docs/perf/baseline-2026-05-27.md`
- sharp: https://sharp.pixelplumbing.com/api-resize
