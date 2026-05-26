---
id: ISSUE-028
title: 画像表示を next/image に全面移行 (AVIF/WebP + lazy + srcset)
priority: P2
status: todo
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

現状すべての画像が **`<img>` 直接** で、 Next.js の image optimization (AVIF / WebP 配信、 自動 lazy、 srcset) を活用していない。
ISSUE-018 / 019 で Supabase image transformation を使うので転送量は減ったが、 さらに:
- AVIF 配信で 20〜30% 削減
- viewport 外の自動 lazy
- レスポンシブ srcset で device に応じた最適サイズ

を取りたい。

---

## スコープ (What)

### ADR

- [ ] `docs/adr/ADR-0011-image-optimization-stack.md`
  - Supabase Storage transformation と Vercel Image Optimization の **二重最適化を避ける** 判断
  - 結論: Supabase で base resize (320 / 1024)、 Vercel で format conversion (AVIF/WebP) という分担
  - もしくは: Supabase だけで完結し、 `<Image unoptimized>` を使う案との比較

### 修正

- [ ] `next.config.ts` の `images` 設定
  ```ts
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
  }
  ```
- [ ] `<img>` 4 箇所を `<Image>` に置換:
  - `src/app/album/page.tsx` (Thumbnail)
  - `src/app/page.tsx` (cover carousel)
  - `src/app/memory/[memoryId]/page.tsx` (本画像)
  - `src/app/record/page.tsx` (file preview — Object URL なので `unoptimized` 必要)
- [ ] 各箇所で適切な `width` / `height` / `sizes` を指定
- [ ] LCP 候補 (memory detail の本画像) には `priority` を付ける

### やらないこと

- blurhash / placeholder の生成 (将来 Issue)
- Service Worker での画像キャッシュ
- Cloudflare R2 への移行

---

## 設計判断

### Vercel Image Optimization を使う前提

Hana は Vercel デプロイ前提 (`CLAUDE.md` 暗黙、 vercel.ts も今後導入予定)。
`unoptimized: false` で Vercel の最適化を活用。

### Supabase transformation との二重 fetch を回避

`<Image src={supabaseUrl}>` で Vercel が AVIF に変換するとき、 source は Supabase の transformation 済画像。
これで「Supabase で resize → Vercel で format」 の流れが成立。 二重 resize にはならない。

### `Record` のプレビューは `unoptimized`

`URL.createObjectURL(file)` は blob URL なので Vercel optimization の対象外。
`unoptimized` を付けて素通り。

---

## 影響範囲

| 領域         | 影響                                              |
| ------------ | ------------------------------------------------- |
| OpenAPI      | なし                                              |
| 生成型       | なし                                              |
| データ       | なし                                              |
| 画面         | `/`, `/album`, `/memory/[id]`, `/record` の画像表示 |
| 設定         | `next.config.ts`                                  |
| CI           | typecheck / lint / format / build / test          |
| ドキュメント | ADR-0011                                          |
| 環境変数     | なし                                              |

---

## 受け入れ条件

- [ ] ADR-0011 が存在
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] DevTools Network で画像が `image/avif` または `image/webp` で配信されている
- [ ] viewport 外の画像が初期ロードに含まれない (lazy)
- [ ] LCP 画像 (memory detail) は `priority` で eagerly loaded
- [ ] Lighthouse "Use modern image formats" / "Properly size images" が 90+ スコア

---

## 動作確認手順

```bash
pnpm dev
# 1. /album を開く → Network filter "img" で Content-Type を確認
# 2. スクロールで lazy 画像が後追いロードされること
# 3. /memory/{id} を開く → 本画像が即時表示
# 4. /record で写真を選択 → preview が unoptimized で表示
# 5. Lighthouse mobile で /album, /memory/{id} を再計測
```

---

## リスク

- Vercel Image Optimization の制限 (月 1000 transformations の Hobby) → 利用量モニタ
- Object URL に `unoptimized` を付け忘れると build error → ESLint rule や Visual QA で確認
- HMR で `next.config.ts` の変更が反映されない → server 再起動を README に記載

---

## 参考

- ISSUE-018 / 019 (前提、 Supabase transformation)
- ISSUE-025〜027 (Server Component 化と同時進行可)
- Next.js Image: https://nextjs.org/docs/app/api-reference/components/image
