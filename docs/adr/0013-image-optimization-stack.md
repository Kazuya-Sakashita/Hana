# ADR-0013: 画像最適化スタックの分担 (upload-time variants + next/image)

- Status: Accepted (改訂版, 2026-07-22)
- Date: 2026-05-27
- Updated: 2026-07-22
- Authors: Hana 開発チーム
- Related: ADR-0009 (image storage), ADR-0012 (image URL caching), ISSUE-028, ISSUE-031

## 文脈 (Context)

ISSUE-016 baseline と ISSUE-019/018/030 完了後の計測で、 `/memory/[id]` の本画像が数 MB の original JPEG として配信され、 LCP の改善余地が残っていた。

当初は Supabase Storage の Image Transformation または Vercel Image Optimization に寄せる案を検討したが、 現在の main では ISSUE-031 により、 アップロード時に `sharp` で `thumbnail` / `preview` の WebP variant を事前生成する構成になっている。

そのため ISSUE-028 の責務は、 byte-size reduction 自体ではなく、 既に生成済みの軽量 variant を `next/image` で安定表示することに再定義する。

## 決定 (Decision)

### 1. 画像最適化スタックの分担

| 工程                       | 担当                                     | 理由                                                |
| -------------------------- | ---------------------------------------- | --------------------------------------------------- |
| 元画像の保管               | Supabase Storage                         | private bucket + presigned URL (ADR-0009)           |
| EXIF 削除                  | upload confirm pipeline                  | 子どもの写真メタデータを保存しない                  |
| Resize / WebP 変換         | upload-time `sharp` variants (ISSUE-031) | plan 依存と signed URL proxy を避ける               |
| signed URL 発行            | `generateSignedImageUrl`                 | `thumbnail` / `preview` / `original` を size で選択 |
| 表示寸法 / lazy / priority | `next/image`                             | CLS 抑制、 viewport 外 lazy、 LCP 候補の priority   |

### 2. `next/image` の方針

- `next.config.ts` は `images.unoptimized: true` を設定する。
- Supabase signed URL を Vercel Image Optimization に proxy しない。
- `/album` と `/` は `thumbnail` variant を 4:5 の固定寸法で表示する。
- `/memory/[memoryId]` は `preview` variant を表示し、 1 枚目のみ `priority` を付ける。
- `/record` のローカル preview は blob URL のため、 既存どおり browser local preview として扱う。

### 3. `next.config.ts`

```ts
images: {
  unoptimized: true,
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
  ],
}
```

`remotePatterns` は、 signed URL host を許可しつつ、 `next/image` の寸法管理と lazy loading を使うために残す。

## 代替案

### A. Vercel Image Optimization に変換を任せる

- 利点: `srcset` と format conversion を Vercel に任せられる。
- 欠点: private signed URL を Vercel 経由で取得することになる。 token 付き URL が cache key になりやすく、 cache 効率と制限管理が複雑になる。
- 判断: ISSUE-031 の upload-time variants があるため採用しない。

### B. Supabase Image Transformation に任せる

- 利点: Storage 側でサイズ変換を完結できる。
- 欠点: plan 依存があり、 Free plan では期待どおりに使えない。
- 判断: MVP の固定費を増やさない方針と合わないため採用しない。

### C. `<img>` のまま variant URL を表示する

- 利点: 実装差分が小さい。
- 欠点: 画像寸法、 lazy loading、 LCP priority の意図がコード上に残りにくい。
- 判断: 画面ごとの画像表示意図を明示できるため `next/image` を採用する。

## 影響 (Consequences)

### Positive

- private signed URL を Vercel optimizer に渡さずに済む。
- WebP 変換と resize は upload pipeline で安定し、 signed URL は variant key を返すだけになる。
- `next/image` により、 表示寸法、 lazy loading、 LCP priority が画面コードで明確になる。

### Negative

- AVIF 変換や device ごとの optimizer `srcset` は使わない。
- variant 生成失敗時は original fallback になり、 一時的に転送量が増える可能性がある。
- 画像サイズの追加が必要になった場合は upload pipeline と backfill の更新が必要。

### Risks

- 既存データの variant が未生成の場合、 original fallback によって LCP が悪化する。
- `thumbnail` / `preview` の寸法が UI とずれた場合、 再生成または新variant追加が必要になる。

## 変更履歴

- 2026-05-27: Supabase transformation と next/image の分担を検討。
- 2026-05-27: Supabase Free plan の制約を踏まえ、 Vercel Image Optimization 案に改訂。
- 2026-07-22: ISSUE-031 の upload-time WebP variants を正とし、 Vercel Image Optimization 依存を廃止。

## 関連

- ISSUE-028 (本 ADR の実装)
- ISSUE-031 (upload-time image variants)
- ADR-0009 (画像 storage 設計)
- ADR-0012 (signed URL の cache ポリシー)
- `docs/perf/baseline-2026-05-27.md`
