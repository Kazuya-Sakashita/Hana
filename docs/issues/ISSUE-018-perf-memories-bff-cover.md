---
id: ISSUE-018
title: /v1/memories レスポンスに cover_thumbnail_url を含める (BFF 化)
priority: P0
status: review
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

現状 `/album` 表示時に **50 件のメモごとに `GET /v1/uploads/{id}/url` を並列発行** している (= 50 HTTP + 50 Supabase signed URL 生成)。
ホーム画面 (`/`) も同じパターンで 5 件並列。

これを **list endpoint がカバー URL を含めて返す** 形に変えれば、 N+1 を根絶できる。
画面表示までのリクエスト数を **51 → 1** に。

---

## スコープ (What)

### OpenAPI 変更 (互換性あり、additive)

- [ ] `docs/openapi/openapi.yaml` の `Memory` schema に optional field 追加
  ```yaml
  cover_thumbnail_url:
    type: string
    format: uri
    nullable: true
    description: First image's signed thumbnail URL (TTL ~25min, transformed to 320px)
  ```
- [ ] `npm run openapi:lint && npm run openapi:gen` 実行

### サーバ修正

- [ ] `src/app/v1/memories/route.ts` の list 取得時、各 memory の `image_ids[0]` に対し
  - Supabase Storage の **image transformation** で width=320, quality=70 の signed URL を生成
  - `Promise.all` で並列 (DB query は 1 回、URL 生成だけ並列)
- [ ] image_id が無いメモは `cover_thumbnail_url: null`

### クライアント修正

- [ ] `src/app/album/page.tsx` の Stage 2 useEffect (50 並列 URL fetch) を削除
- [ ] `src/app/page.tsx` (home) の 5 並列 URL fetch を削除
- [ ] 両者で `memory.cover_thumbnail_url` を直接 `<img src>` に流す

### やらないこと

- 本画像 (`/memory/[id]` のフル表示) の事前生成 → 現状通り個別 `/uploads/{id}/url` を使う
- batch endpoint `/v1/uploads/urls` (代替案、本Issueで不要に)
- Cache-Control の調整 → ISSUE-019

---

## 設計判断

### transformation サイズ = 320px

`/album` のカード横幅が最大 ~ 420px、 cover が 80×80 か 4:5 (~110×140) のサイズ感。
Retina 対応で 2× = 320px が安全圏。 quality=70 で 20〜40KB に収まる想定。

### TTL は 25 分 (Supabase 30分 - 5分のバッファ)

list を取得して画面が開いてから操作するまでに数分かかる想定。
25 分あれば再取得不要 (ISSUE-019 の client cache と組み合わせる)。

### list の URL 生成失敗時は `null` を返す

Storage 障害でリスト全体が落ちるのを避ける。
クライアントは `null` を `❀` placeholder で fallback (既存パターン)。

---

## 影響範囲

| 領域         | 影響                                                            |
| ------------ | --------------------------------------------------------------- |
| OpenAPI      | `Memory` schema に optional field 追加 (additive、互換性あり)   |
| 生成型       | `npm run openapi:gen` で更新                                    |
| データ       | なし                                                            |
| 画面         | `/album` / `/` (cover fetch ロジック削除)                       |
| API          | `/v1/memories` (cover_thumbnail_url を埋める)                   |
| テスト       | list レスポンスに `cover_thumbnail_url` が含まれることを assert |
| CI           | typecheck / lint / format / build / test                        |
| ドキュメント | このIssueファイル + openapi yaml                                |
| 環境変数     | なし                                                            |

---

## 受け入れ条件

- [ ] `pnpm openapi:lint` / `openapi:gen` 差分コミット済
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 全件パス + 新規テスト
- [ ] `/album` 表示時の `/uploads/*/url` リクエストが **0 件** (DevTools Network 確認)
- [ ] `/` 表示時の `/uploads/*/url` リクエストが **0 件**
- [ ] 画像転送量合計が `/album` (50 件) で 2MB 以下
- [ ] image_id が無い memory も正常表示 (`null` → ❀ placeholder)

---

## 動作確認手順

```bash
pnpm openapi:gen
pnpm dev
# 1. /album を開き、DevTools Network filter "url" でリクエスト数 0 を確認
# 2. /album の画像合計 Transfer size を Network で確認 (期待: < 2MB)
# 3. / を開き、最近5件の cover も同様にチェック
# 4. 画像 ID 0 件のメモ (古いテストデータ) を作って ❀ 表示を確認
# 5. /album → /memory/{id} 遷移は引き続き個別の /uploads/{id}/url を使うことを確認
```

---

## セキュリティ・プライバシー考慮

- [ ] cover_thumbnail_url は **所有者本人にのみ発行** (既存 `requireUser` で担保)
- [ ] URL は 25 分 TTL、漏洩しても短時間
- [ ] ログには URL を出さない (allowlist で url field を除外)

---

## リスク

- transformation の Free tier 上限超過 → Supabase ダッシュボードで利用量モニタ
- list の応答時間が増える可能性 (URL 生成 50 並列) → 計測で +50ms 以下を確認、超えたら parallel limit 検討

---

## 参考

- ISSUE-008 (Storage)
- ISSUE-009 (memories list)
- ISSUE-015 (album thumbnails、現状の N+1)
- ISSUE-019 (Cache-Control / client cache 補完)
