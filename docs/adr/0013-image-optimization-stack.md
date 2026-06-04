# ADR-0013: 画像最適化スタックの分担 (Supabase + next/image)

- Status: Accepted
- Date: 2026-05-27
- Authors: Hana 開発チーム
- Related: ADR-0009 (image storage), ADR-0012 (image URL caching)

## 文脈 (Context)

ISSUE-016 ベースライン + ISSUE-019/018/030 完了後の Lighthouse 再計測 (`docs/perf/baseline-2026-05-27.md`) で、 **Speed Index は -45% 改善したが LCP は variance 内で横ばい** と判明。 残る支配要因:

1. 画像バイト数 (Supabase の resize=contain 後でもまだ重い、 特に LCP 画像)
2. `<img>` の late discovery (LCP 画像が parser から遅れて発見される)
3. lazy loading 未活用 (`/album` の off-screen サムネも全部即時 fetch)

これらを Next.js の `next/image` で解消する。

## 決定 (Decision)

### 1. Supabase Storage と Vercel Image Optimization の分担

| 工程                          | 担当                                       | 理由                                                                   |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Resize (320 / 1024)           | **Supabase Storage transformation**        | 既に ISSUE-019 で実装済、 storage 直結なので余計な往復なし             |
| Format conversion (WebP/AVIF) | **Supabase Storage transformation (自動)** | Supabase は format 未指定で Accept ヘッダに応じて modern format を返す |
| Lazy / priority / CLS 防止    | **next/image (`unoptimized={true}`)**      | Vercel proxy は通さない、 attribute だけ恩恵                           |

→ **Vercel Image Optimization は使わない** (`unoptimized={true}`)。 理由:

- Signed URL の token が毎リクエスト変わる → Vercel cache key が分散して効率悪い
- Free tier (1000 transformations/月) を超えるリスク
- Supabase 側で既に resize + WebP 配信されているので二重最適化は無駄

### 2. `unoptimized={true}` でも得られる next/image の利点

- `loading="lazy"` がデフォルト → off-screen 画像を遅延ロード (`/album` で特に効く)
- `priority` hint → LCP 候補画像を fetchpriority="high" で前倒し (memory 詳細で使用)
- `width` / `height` 必須 → CLS 防止 (本ファイル時点で CLS は既に 0 だが回帰防止)
- `sizes` で適切な intrinsic size hint

### 3. Object URL (`URL.createObjectURL`) の扱い

`/record` のアップロード前プレビューは blob URL なので Vercel proxy が扱えない (リモートでないため)。 → 必ず `unoptimized` を付与。

### 4. `next.config.ts` の最小設定

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
  ],
}
```

`unoptimized={true}` でも remotePatterns を入れておく理由: 将来 unoptimized を外す可能性 (Vercel cache の状況改善 / Pro 課金など) のための足場。

## 代替案

### A. Vercel Image Optimization 経由 (`unoptimized={false}`)

- 利点: AVIF/WebP に format 変換 (Supabase 側より高品質な可能性)
- 欠点: signed URL token がランダムなので cache が分散、 Free tier 制限あり
- **却下**: Hana MVP 規模では cost > benefit

### B. next/image を使わず `<img>` のままで lazy="lazy" 手動付与

- 利点: 依存が増えない、 動作が単純
- 欠点: `priority` hint (fetchpriority="high") を Next.js が自動で `<head>` の preload に変換する仕組みを失う
- **却下**: LCP 画像の前倒しが next/image の真の価値

### C. Supabase の format=webp を明示指定

- Supabase の `TransformOptions.format` は型上 `'origin'` のみ
- 未指定だと自動で modern format を返す (現状の挙動)
- **採用しない**: 明示しないのが正解

## 影響 (Consequences)

### Positive

- `/album` の off-screen サムネが遅延ロードされ、 初期帯域消費が大幅減
- `/memory/[id]` の本画像が `priority` で早期発見 → LCP 改善見込み
- CLS リスクが恒久的にゼロに (width/height 強制)
- 画像配信は引き続き Supabase 直結、 Vercel コストゼロ

### Negative

- next/image 依存が 4 ファイルに伝播 (`/album`, `/`, `/memory/[id]`, `/record`)
- `unoptimized` を外す日が来たら `remotePatterns` の精密化が必要 (現状は `*.supabase.co` で広い)

### Risks

- Supabase の自動 format negotiation が将来挙動を変えたら影響 → 計測で監視
- `priority` の使いすぎは逆効果 → memory 詳細の 1 枚目のみに限定

## 関連

- ISSUE-028 (本 ADR の実装)
- ADR-0009 (画像 storage 設計)
- ADR-0012 (signed URL の cache ポリシー)
- `docs/perf/baseline-2026-05-27.md` (改善前の数値)
- Next.js Image: https://nextjs.org/docs/app/api-reference/components/image
- Supabase Image Transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
