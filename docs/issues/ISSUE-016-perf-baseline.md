---
id: ISSUE-016
title: パフォーマンス計測ベースラインの取得とドキュメント化
priority: P0
status: done
size: S
created_at: 2026-05-26
merged_at: 2026-05-26
pr: 36
parent: PERF
---

## 目的 (Why)

ISSUE-017 以降のパフォーマンス改善で **「改善前 → 改善後」を数値で比較できるようにする** ための前提作業。
ベースラインがないと改善は感覚論になり、退行 (regression) も検知できない。

---

## スコープ (What)

### 新規

- [ ] `docs/perf/baseline-2026-05-26.md` を作成し、以下を記録:
  - 主要 3 ページ (`/`, `/album`, `/memory/[id]`) の Lighthouse mobile スコア
    - Performance / Accessibility / Best Practices / SEO
    - Web Vitals: FCP / LCP / TBT / CLS / Speed Index
  - 各ページの DevTools Network panel スナップショット
    - リクエスト数 / Transfer size 合計 / DOMContentLoaded / Load
  - 主要 API のレスポンスタイム p50/p95 (`/v1/memories?limit=50`, `/v1/me`, `/v1/children`)
  - Prisma クエリログから抽出した 1 リクエストあたりの query 数 (主要ルート)
- [ ] `docs/perf/README.md` を作成: 計測の取り方 (Lighthouse mobile / DevTools throttling = Slow 4G + 4× CPU)

### やらないこと

- ベンチマーク自動化 (CI) → ISSUE-024 (Web Vitals) と組合せて別途検討
- アプリ側の挙動変更は **一切しない**

---

## 設計判断

### Lighthouse mobile + Slow 4G + 4× CPU をデフォルトに

開発者の MacBook はスペックが高すぎ、デスクトップ Lighthouse では遅さが見えない。
モバイル + スロットリングを基準にすることで、想定ユーザー (子育て中・電車内・片手操作) の体験を反映する。

### 数値を Markdown で残す理由

スクリーンショットだけだと grep できず、後から比較が大変。
表形式で残し、各改善 ISSUE の PR で「改善前 → 改善後」表を更新していく。

---

## 影響範囲

| 領域         | 影響                                   |
| ------------ | -------------------------------------- |
| OpenAPI      | なし                                   |
| 生成型       | なし                                   |
| データ       | なし                                   |
| 画面         | なし (計測のみ)                        |
| API          | なし                                   |
| CI           | なし                                   |
| ドキュメント | `docs/perf/` 新規ディレクトリ + 2 file |
| 環境変数     | なし                                   |

---

## 受け入れ条件

- [ ] `docs/perf/baseline-2026-05-26.md` が存在し、3 ページ分のスコアが記録されている
- [ ] `docs/perf/README.md` に計測手順が書かれている
- [ ] CLAUDE.md からのリンクを §13 参考に追加

---

## 動作確認手順

```bash
pnpm dev
# 1. Chrome DevTools を開き、Lighthouse タブで mobile / Performance のみ有効化
# 2. /, /album, /memory/{id} で順に計測
# 3. Network panel で Throttling を Slow 4G にし、ハードリロード後の数値を記録
# 4. dev tools の Performance タブで FCP/LCP を確認
# 5. すべて docs/perf/baseline-2026-05-26.md に記録
```

---

## 参考

- ISSUE-017〜ISSUE-029 (すべてこのベースラインを参照)
- V0 prompt §1「Whisper not shout」 — 速度も「whisper」の一部
