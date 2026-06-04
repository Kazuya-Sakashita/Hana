# ADR-0013: 画像最適化スタックの分担 (Supabase + Vercel Image Optimization)

- Status: Accepted (改訂版、 2026-05-27)
- Date: 2026-05-27
- Authors: Hana 開発チーム
- Related: ADR-0009 (image storage), ADR-0012 (image URL caching)

## 文脈 (Context)

ISSUE-016 baseline + ISSUE-019/018/030 完了後の Lighthouse 再計測 (`docs/perf/baseline-2026-05-27.md`) で、 **Speed Index は -45% 改善したが LCP は variance 内で横ばい** と判明。 詳しく Network panel で実測した結果:

- `/memory/[id]` の本画像が **2.3〜3.7 MB の JPEG** で配信されていた
- URL は `/storage/v1/object/sign/...` (transformation **適用なし** の path)
- ISSUE-019 で実装した `resize=contain` + quality 設定は **完全に無視されていた**

**根本原因**: Supabase Storage の Image Transformation は **Pro plan ($25/月) 以上の機能**で、 Free plan では transform option を silent fallback で無視し original を返す。 Hana は Free plan のため、 サーバ側で透過的に optimization する手段が無い。

## 決定 (Decision)

### 1. 画像最適化スタックの分担 (改訂版)

| 工程                                   | 担当                          | 理由                                      |
| -------------------------------------- | ----------------------------- | ----------------------------------------- |
| 元画像の保管                           | Supabase Storage              | private bucket + presigned URL (ADR-0009) |
| Resize / format conversion (WebP/AVIF) | **Vercel Image Optimization** | Free plan の Supabase で唯一実用的な手段  |
| Lazy / priority / CLS 防止             | next/image attributes         | Vercel optimization の付随機能            |

### 2. `unoptimized` 方針

- **Supabase signed URL を `src` にする <Image>**: `unoptimized` **指定しない** (= `false`、 Vercel optimization 経由)
  - `/album` thumbnail / `/` home carousel / `/memory/[id]` 本画像
- **blob URL (`URL.createObjectURL`)**: `unoptimized` **必須**
  - `/record` のアップロード前 preview (Vercel proxy が blob URL を扱えない)

### 3. `next.config.ts` 設定

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
  ],
  formats: ['image/avif', 'image/webp'],
}
```

### 4. macOS dev での IPv6/NAT64 問題への対応

macOS の dev 環境では Supabase ホスト名が NAT64 prefix (`64:ff9b::...`) で IPv6 化される。 Next.js の SSRF 保護 (image optimization の upstream fetch) がこの IPv6 表記を誤って "private ip" と判定し、 画像取得を拒否する。 ログに `upstream image ... resolved to private ip ["64:ff9b::..."]` と出る。

対応: **`package.json` の dev / start script に `NODE_OPTIONS='--dns-result-order=ipv4first'` を付与** して Node.js の DNS 解決を IPv4 優先にする。 NAT64 経路を避け、 直接 IPv4 で Cloudflare に到達する。

```json
"dev": "NODE_OPTIONS='--dns-result-order=ipv4first' next dev",
"start": "NODE_OPTIONS='--dns-result-order=ipv4first' next start",
```

Vercel 本番では起きない (内部 DNS 経路が異なる)。 dev / self-hosted 環境専用の workaround。

### 5. Vercel Image Optimization の利用上の注意

- **Cache key は src URL**: Supabase signed URL の token は 30 分有効、 毎回新しい URL が生成されると Vercel cache が分散
  - 軽減策: ISSUE-019 の `imageUrlCache` (sessionStorage / 25 分 cache) で client 側で URL を再利用 → 同じ URL が Vercel cache hit する
  - ISSUE-018 (BFF) で server が cover URL を埋めるが、 list の各 request で新 URL が発行される (将来 SSR cache 検討余地)
- **Vercel Hobby の制限**: 1000 unique source images / 月
  - Hana MVP 規模では当面足りるが、 ユーザー数 + memory 数 × session 数 が増えたら超過リスク
  - 監視 + 超過時に Pro upgrade or 事前生成 (ISSUE 別途)

## 代替案

### A. Supabase Pro plan ($25/月) に upgrade

- 利点: ISSUE-019 のコードがそのまま動く、 シンプル
- 欠点: 月額固定費、 MVP 段階では不必要
- **却下** (現時点): 利用者が確定するまで Vercel 無料枠で十分

### B. アップロード時に sharp で 3 サイズ事前生成 (original / preview / thumbnail)

- 利点: 完全に無料、 plan 依存ゼロ、 cache key 安定
- 欠点: アップロード latency 増加、 storage 容量 3 倍、 失敗時のリカバリー実装が要る
- **却下** (現時点): 工数 1-2 日、 Vercel 無料枠で当面回るので保留

### C. 全て `unoptimized={true}` で original 配信のまま

- 利点: 何もしない
- 欠点: LCP が改善しない (現状)
- **却下**: 解決にならない

## 影響 (Consequences)

### Positive

- 既存の next/image コードからほぼ変更なし (`unoptimized` 削除のみ)
- Vercel が AVIF/WebP に変換、 srcset で device に応じた解像度配信
- 課金プラン変更なし、 環境変数追加なし

### Negative

- Vercel Hobby の 1000 src/月制限と隣り合わせ → 監視が必要
- Vercel optimization の初回 fetch は Supabase からの転送 (egress) が発生 → Supabase Free 帯域上限への影響を要確認
- Signed URL token の dynamic 性で cache 効率が落ちる (将来 SSR cache で改善検討)

### Risks

- Vercel Hobby 制限超過時の挙動 (有料に切替 or オリジナル fallback) を要確認
- Supabase Free egress (2GB/月) 上限 — original 画像が頻繁に Vercel に転送されるとリスク

## 変更履歴

- **2026-05-27 (初版)**: Supabase で resize + WebP、 next/image は `unoptimized={true}` で素通し方針
- **2026-05-27 (改訂)**: 実測で Supabase Free plan は transformation 未対応と判明。 Vercel Image Optimization 経由に切替 (本決定)

## 関連

- ISSUE-028 (本 ADR の実装)
- ADR-0009 (画像 storage 設計)
- ADR-0012 (signed URL の cache ポリシー)
- `docs/perf/baseline-2026-05-27.md`
- Next.js Image: https://nextjs.org/docs/app/api-reference/components/image
- Vercel Image Optimization 料金: https://vercel.com/docs/image-optimization
- Supabase Image Transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
