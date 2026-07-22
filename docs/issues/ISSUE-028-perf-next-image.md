---
id: ISSUE-028
title: 画像表示を next/image に移行 (WebP variants + lazy + priority)
priority: P1
status: review
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

ISSUE-031 でアップロード時に `thumbnail` / `preview` の WebP variant を生成するようになった。 ISSUE-028 では、それらの軽量画像を画面側で安定して表示するため、主要な `<img>` 表示を `next/image` に移行する。

狙いは以下:

- 表示寸法をコード上で固定し、 CLS を起こしにくくする
- viewport 外画像の lazy loading を `next/image` に任せる
- `/memory/[memoryId]` の 1 枚目を LCP 候補として `priority` 指定する
- private signed URL を Vercel Image Optimization に proxy せず、 upload-time variant をそのまま表示する

---

## スコープ (What)

### ADR

- [x] `docs/adr/0013-image-optimization-stack.md`
  - Supabase Storage の private bucket + presigned URL
  - upload-time `sharp` variants (ISSUE-031)
  - `next/image` は寸法、 lazy、 priority を担当
  - `images.unoptimized: true` で Vercel Image Optimization には通さない

### 修正

- [x] `next.config.ts` の `images` 設定
  ```ts
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  }
  ```
- [x] `<img>` 3 箇所を `<Image>` に置換:
  - `src/app/album/page.tsx` (Thumbnail)
  - `src/app/page.tsx` (cover carousel)
  - `src/app/memory/[memoryId]/page.tsx` (本画像)
- [x] 各箇所で適切な `width` / `height` / `sizes` を指定
- [x] LCP 候補 (memory detail の本画像 1 枚目) には `priority` を付ける

### やらないこと

- blurhash / placeholder の生成 (将来 Issue)
- Service Worker での画像キャッシュ
- Cloudflare R2 への移行
- Vercel Image Optimization による AVIF / responsive optimizer `srcset`

---

## 設計判断

### upload-time variants を正とする

現行 main では ISSUE-031 により、 `generateSignedImageUrl(storageKey, size)` が `thumbnail` / `preview` / `original` を選び、 variant がなければ original にフォールバックする。

この Issue ではその設計を維持し、 画面側は渡された signed URL を `next/image` で表示する。

### Vercel Image Optimization は使わない

private signed URL を Vercel の optimizer に渡すと、 token 付き URL が cache key になりやすく、 cache 効率と制限管理が複雑になる。 画像の byte-size reduction は upload-time WebP variant で担保する。

### `Record` のプレビューは対象外

`/record` のアップロード前 preview は blob URL (`URL.createObjectURL(file)`) を使う。 remote signed URL ではないため、本 Issue の主要移行対象から外す。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/`, `/album`, `/memory/[id]` の画像表示 |
| 設定         | `next.config.ts`                         |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | ADR-0013                                 |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [x] ADR-0013 が存在し、 upload-time variants + next/image の分担が明記されている
- [x] `pnpm pr:gate` グリーン
- [ ] DevTools Network で `/album` / `/memory/[id]` の画像が WebP variant signed URL で配信されている
- [ ] viewport 外の画像が初期ロードに含まれない (lazy)
- [ ] LCP 画像 (memory detail の 1 枚目) は `priority` で eagerly loaded
- [ ] Lighthouse "Properly size images" が悪化していない

---

## 動作確認手順

```bash
pnpm build
pnpm start
# 1. /album を開く → Network filter "img" で *_thumb.webp signed URL を確認
# 2. スクロールで lazy 画像が後追いロードされること
# 3. /memory/{id} を開く → 1 枚目 preview 画像が即時表示されること
# 4. Network filter "img" で *_preview.webp signed URL を確認
# 5. Lighthouse mobile で /album, /memory/{id} を再計測
```

---

## リスク

- 既存データに variant がない場合、 original fallback により転送量が一時的に増える
- `next/image` の `width` / `height` と CSS aspect ratio がずれると表示崩れの可能性がある
- HMR で `next.config.ts` の変更が反映されないため、確認時は server 再起動が必要

---

## 参考

- ISSUE-031 (upload-time image variants)
- ISSUE-025〜027 (Server Component 化)
- Next.js Image: https://nextjs.org/docs/app/api-reference/components/image
