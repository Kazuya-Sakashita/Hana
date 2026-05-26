---
id: ISSUE-019
title: 画像 URL の Cache-Control 適正化 + クライアント URL キャッシュ
priority: P0
status: done
size: M
created_at: 2026-05-26
merged_at: 2026-05-27
pr: 38
parent: PERF
---

## 目的 (Why)

ISSUE-018 で list レベルの N+1 は解消するが、 **詳細画面 (`/memory/[id]`) では本画像 URL を個別取得** したままになる。

- presigned URL の **Cache-Control が未設定**。 CLAUDE.md の `private, no-store` 記述だと TTL 30 分の活用ができない
- クライアント側 URL キャッシュなし → タブ切替やページ再訪で同じ URL を再発行

詳細画面の体感速度と Supabase 負荷を下げる。

---

## スコープ (What)

### 設計判断 ADR

- [ ] `docs/adr/ADR-0012-image-url-caching.md` を作成
  - **サムネ用 URL**: `Cache-Control: private, max-age=1500` (25min、TTL とほぼ一致)
  - **本画像 URL**: `Cache-Control: private, max-age=300` (5min、念のため短め)
  - 「子どもの画像が漏れる」リスクは presigned URL の TTL がある時点で時間制限あり、 cache はブラウザ単位なので追加リスクなし
  - CLAUDE.md §7 の `Cache-Control: private, no-store` 記述を訂正

### サーバ修正

- [ ] `src/app/v1/uploads/[imageId]/url/route.ts`
  - response header に `Cache-Control: private, max-age=300` を付与
  - クエリ param `size=thumbnail|preview|original` を受ける (default: original)
    - `thumbnail`: transformation `width=320, quality=70`
    - `preview`: transformation `width=1024, quality=80`
    - `original`: 変換なし
- [ ] `src/app/v1/memories/route.ts` (ISSUE-018 で追加した cover URL) のレスポンスヘッダも `private, max-age=300`

### クライアント修正

- [ ] `src/lib/cache/image-url-cache.ts` を新設
  - `Map<imageId, { url, expiresAt }>` の in-memory cache
  - `sessionStorage` に永続化 (タブ切替で残す)
  - `get(imageId)` / `set(imageId, url, ttlSec)` / `clear()`
- [ ] `/memory/[id]` の URL fetch でこの cache を経由

### CLAUDE.md 修正

- [ ] §7 の Cache-Control 記述を ADR-0012 への参照に変更

### やらないこと

- Service Worker / IndexedDB (将来)
- 完全な永続キャッシュ (Cloudflare R2 等) → MVP では不要

---

## 設計判断

### `private, max-age=1500` の根拠

- `private`: 共有 cache (CDN/proxy) には載せない (個人画像なので必須)
- `max-age=1500`: presigned URL TTL 30 分 - 5 分バッファ
- ブラウザ HTTP cache だけで効くので、 PWA 化前でも有効

### サイズ別 endpoint よりクエリ param を選ぶ理由

新 endpoint を増やすと OpenAPI が膨張。
同じリソースに対する「表現サイズ」 はクエリ param が REST 的にも自然。

---

## 影響範囲

| 領域         | 影響                                             |
| ------------ | ------------------------------------------------ |
| OpenAPI      | `/v1/uploads/{imageId}/url` に `size` クエリ追加 |
| 生成型       | `npm run openapi:gen` で更新                     |
| データ       | なし                                             |
| 画面         | `/memory/[id]` (preview size 指定)               |
| API          | uploads URL endpoint                             |
| テスト       | Cache-Control header / cache hit のユニット      |
| CI           | typecheck / lint / format / build / test         |
| ドキュメント | ADR-0012 / CLAUDE.md §7 修正                     |
| 環境変数     | なし                                             |

---

## 受け入れ条件

- [ ] ADR-0012 が存在
- [ ] CLAUDE.md §7 が ADR-0012 参照に書き換わっている
- [ ] `pnpm openapi:lint` / `gen` グリーン
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test`
- [ ] `/memory/{id}` を 2 回開いて、 2 回目は `/uploads/*/url` を呼ばない (in-memory cache hit)
- [ ] Response Header に `Cache-Control: private, max-age=300` が付いている
- [ ] `size=preview` で 1024px の画像が返る

---

## 動作確認手順

```bash
pnpm dev
# 1. /memory/{id} を開く → URL 1 件 fetch
# 2. /album に戻る → /memory/{id} を再度開く → URL fetch 0 件 (cache hit)
# 3. DevTools Network で Cache-Control ヘッダを確認
# 4. ?size=preview / ?size=original を直接叩いて画像サイズが変わることを確認
# 5. 30 分 (実際は 25 分) 経過後の再訪で URL が再取得されることを確認
```

---

## セキュリティ・プライバシー考慮

- [ ] `private` で共有 cache を禁止 (CDN/中間 proxy に乗らない)
- [ ] sessionStorage はタブ閉じで消える (永続化しすぎない)
- [ ] サインアウト時に `image-url-cache.clear()` を呼ぶ
- [ ] ADR-0012 で漏洩シナリオを文書化

---

## リスク

- ブラウザ cache が古い URL を返し、TTL 切れで 401/403 → クライアントは `<img onerror>` で cache をクリアして 1 回再取得 fallback
- session 共有環境 (家族で同じデバイス) → `private` だけでは不十分、サインアウト時 clear を必ず

---

## 参考

- ISSUE-008 / ISSUE-015 / ISSUE-018
- CLAUDE.md §7 (Cache-Control 記述、本Issueで更新)
- ADR-0009 (画像 EXIF / 信頼モデル)
