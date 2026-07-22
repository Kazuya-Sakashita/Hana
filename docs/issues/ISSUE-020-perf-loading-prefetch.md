---
id: ISSUE-020
title: loading.tsx + Link prefetch で体感速度を向上
priority: P1
status: review
size: S
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

実 latency が同じでも、 **画面遷移時の skeleton 表示と prefetch** で体感速度は大幅に変わる。
現状:

- `loading.tsx` / `error.tsx` / `<Suspense>` 未使用 → 真っ白 → ドンの遷移
- `<Link>` の prefetch を明示しておらず、動的ルートはほぼ未 prefetch

「フルの再構築 (Server Component 化)」 は ISSUE-025〜027 で行うが、 **その前に低リスクで効く施策** を先行で入れる。

---

## スコープ (What)

### 新規

- [x] `src/app/album/loading.tsx`
  - card 形状の skeleton ×6 + ヘッダー skeleton
- [x] `src/app/memory/[memoryId]/loading.tsx`
  - 大画像 4:5 skeleton + テキスト skeleton 3 行
- [x] `src/app/loading.tsx`
  - hero card skeleton + horizontal carousel skeleton

### 修正

- [x] 主要動線の `<Link>` に `prefetch={true}` を明示
  - `/` → `/album` (もっとみる)
  - `/settings` → `/album` / `/` (戻り動線)
- [x] **prefetch しない** 動線:
  - `/memory/[id]` 宛ての動線 (DB 参照 + signed URL 発行を伴う動的詳細の先読み負荷を避ける)
  - `/record` 宛ての動線 (集中フロー保護)
  - `/sign-in` 周り
  - `/record` → どこか (集中フロー)
- [x] BottomNav の Link は **prefetch on viewport** (`prefetch={true}` で OK)

### やらないこと

- Server Component 化 (ISSUE-025〜027)
- Suspense 境界の挿入 (Server Component 化と同時)
- skeleton ライブラリ導入 (Tailwind animate-pulse で自前)

---

## 設計判断

### loading.tsx の役割は「遷移時のチカチカ防止」

App Router の `loading.tsx` は **route segment の Suspense fallback** として動作。
Server Component が無くても、 client の初回データ取得中に表示される効果がある (Next.js が segment boundary で stream する)。

### skeleton は形状一致を最優先

「同じ場所にコンテンツが現れる」 ことが体感速度に直結。
色味は `bg-warm` (既存) で `animate-pulse`。
V0 §1「Whisper not shout」に合わせて主張しすぎない。

### prefetch の副作用

`prefetch={true}` は production build で viewport に入ると route を事前取得する。

- 帯域/サーバコスト: `/album` など軽い動線に限定し、`/memory/[id]` のような DB 参照 + signed URL 発行を伴う動的詳細は明示 prefetch しない
- セキュリティ: 既存の auth は維持されるので問題なし

---

## 影響範囲

| 領域         | 影響                                                   |
| ------------ | ------------------------------------------------------ |
| OpenAPI      | なし                                                   |
| 生成型       | なし                                                   |
| データ       | なし                                                   |
| 画面         | `/`, `/album`, `/memory/[id]` に loading.tsx           |
| Link         | 軽い主要動線で prefetch={true}、重い動的詳細は既定動作 |
| CI           | typecheck / lint / format / build / test               |
| ドキュメント | このIssueファイル                                      |
| 環境変数     | なし                                                   |

---

## 受け入れ条件

- [x] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] DevTools Throttling Slow 4G で遷移時に skeleton が見える
- [ ] `/` 読み込み後、 DevTools Network で `/album` の HTML が prefetch されている
- [x] skeleton の色味・形状が「whisper」原則に沿う (V0 §1)
- [x] /record への prefetch は **入っていない** (集中フロー保護)

未チェックの DevTools 2項目は、PR merge 前の人間確認ゲートとして残す。
自動検証では `prefetch` prop と `loading.tsx` の存在、`pnpm pr:gate` まで確認済み。

---

## 動作確認手順

```bash
pnpm build
pnpm start
# 1. Chrome DevTools Throttling = Slow 4G
# 2. /album を開く → skeleton ×6 が見える → リスト表示
# 3. /album → /memory/{id} → 詳細 skeleton → 本画像
# 4. / 読み込み後、Network panel で /album の prefetch を確認
# 5. /memory/{id} 宛て Link で未訪問詳細の full route/data prefetch が過剰発火しないことを確認
# 6. /record 宛て Link では prefetch が発火しないことを確認
# 7. /record を開いている時、BottomNav (非表示なので問題なし) の prefetch も発火しないことを確認
```

---

## リスク

- prefetch しすぎでモバイル回線や signed URL 発行を圧迫 → 軽い主要動線のみに限定
- skeleton と実コンテンツの差で CLS 増 → 形状一致でほぼゼロを目指す

---

## 参考

- ISSUE-016 (baseline)、改善前後の Lighthouse 比較
- ISSUE-025〜027 (Server Component 化の前段として)
- Next.js App Router loading.tsx: https://nextjs.org/docs/app/api-reference/file-conventions/loading
