---
id: ISSUE-021
title: bundle analyzer 導入 + Noto Serif JP weight 削減
priority: P1
status: review
size: S
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

初回 JS / フォントのサイズは LCP に直結する。
現状:

- bundle 可視化ツールが無く、 dependency の影響が見えない
- Noto Serif JP は `weight: ['400', '500', '700']` の 3 種類を読んでいる → 実使用は 400 と 700 のみの可能性

「重くなりにくい構成」 の前提として、 **継続的な bundle 監視** と **font の最小化** を確立する。

---

## スコープ (What)

### 新規 / 修正

- [x] `@next/bundle-analyzer` を devDependencies に追加
- [x] `next.config.ts` を bundle-analyzer 対応に
  ```ts
  import bundleAnalyzer from '@next/bundle-analyzer'
  const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })
  export default withBundleAnalyzer({ ... })
  ```
- [x] `package.json` に script を追加
  - `"analyze": "ANALYZE=true pnpm build:ci --webpack"`
- [x] `docs/perf/bundle-baseline.md` を作成
  - `ANALYZE=true pnpm build` の結果 (main / framework / app/page chunks のサイズ) を記録
- [x] **Noto Serif JP の weight 棚卸し**:
  - `src/` 全体で `font-serif` を使うコンポーネントを grep
  - 各箇所で実際に必要な weight (基本は normal=400 と bold=700) を特定
  - `layout.tsx` の weight 配列を必要最小限に削減 (おそらく `['400', '700']` で OK)
- [ ] (任意) `lucide-react` の使用箇所を確認、 named import で tree-shake されているかチェック

### やらないこと

- 大きな依存の置換 (motion / @anthropic-ai/sdk など) → 別 Issue
- CSS の最適化 (Tailwind は十分小さい)

---

## 設計判断

### bundle-analyzer は dev ツールとして導入、CI には載せない

- 開発者が ad-hoc に `pnpm analyze` で確認できる
- PR ごとの bundle diff comment は **将来 ISSUE** で検討 (今は手動運用)

### Noto Serif JP weight 削減のリスク

500 weight を使っているコンポーネントがあれば `font-semibold` の見た目が変わる。
**先に grep で全箇所を洗い出してから削減** する手順を踏む。

---

## 影響範囲

| 領域         | 影響                                           |
| ------------ | ---------------------------------------------- |
| OpenAPI      | なし                                           |
| 生成型       | なし                                           |
| データ       | なし                                           |
| 画面         | 全画面で font weight 変更 (見た目変化の可能性) |
| API          | なし                                           |
| CI           | typecheck / lint / format / build / test       |
| ドキュメント | `docs/perf/bundle-baseline.md`                 |
| 環境変数     | `ANALYZE` (dev only)                           |

---

## 受け入れ条件

- [x] `pnpm analyze` で bundle visualization が `.next/analyze/` 配下に出力
- [x] `docs/perf/bundle-baseline.md` に main の First Load JS / framework size が記録
- [x] Noto Serif JP の weight が必要最小限 (例: `['400', '700']`) に
- [ ] 全画面で見た目が大きく変わらない (Visual QA で 5 画面確認)
- [x] First Load JS が main で **+0% 以下** (回帰しない)

---

## 動作確認手順

```bash
pnpm analyze
# 1. .next/analyze/client.html を開いて bundle 可視化を確認
# 2. main / framework / app/page サイズを bundle-baseline.md に記録
pnpm dev
# 3. /, /album, /memory/{id}, /record, /settings の見た目を確認
# 4. 「のこす」「タイトル」「ほんぶん」 などの font weight 表示が同じであること
```

---

## リスク

- 500 weight が「微妙な強調」 として使われていた場合の見た目変化 → grep + Visual QA でカバー
- font 削減で .woff2 が完全再生成 → 次回ロードのみ若干遅延 (キャッシュで吸収)

---

## 参考

- ISSUE-006c (デザインシステム / Tailwind tokens)
- ISSUE-016 (baseline)
- `@next/bundle-analyzer`: https://www.npmjs.com/package/@next/bundle-analyzer
