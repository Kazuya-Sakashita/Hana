---
id: ISSUE-024
title: Web Vitals 計測基盤の導入
priority: P2
status: done
size: S
created_at: 2026-05-26
merged_at: 2026-06-11
pr: 56
parent: PERF
---

## 目的 (Why)

ISSUE-016 で取った **ベースラインは synthetic (Lighthouse)** で、 RUM (Real User Monitoring) ではない。
ユーザーの実機 (色々な回線・端末) での LCP/INP/CLS を継続計測しないと、 「直したつもりで悪化」 を見逃す。

軽量な仕組みで継続計測の足場を作る。

---

## スコープ (What)

### 新規

- [ ] `web-vitals` を dependencies に追加
- [ ] `src/lib/perf/report.ts` を新設
  - `onCLS / onLCP / onINP / onFCP / onTTFB` を購読
  - `navigator.sendBeacon('/v1/metrics/vitals', payload)` で送信
- [ ] `src/app/v1/metrics/vitals/route.ts` (Route Handler)
  - POST body を validate (zod) → 構造化ログのみ出力 (DB 保存はしない、Vercel Logs で十分)
  - body には PII を含めない (allowlist: `name / value / id / navigationType / userIdHash / route`)
- [ ] `src/components/web-vitals-reporter.tsx` (Client Component)
  - layout.tsx に組み込み、 mount 時に `report.ts` の購読を開始
- [ ] OpenAPI に `/v1/metrics/vitals` を追加 (POST、 201 / 400 / 401)

### CLAUDE.md 更新

- [ ] §13 参考に `docs/perf/` リンク追記

### やらないこと

- Vercel Speed Insights / Analytics 課金プロダクトの有効化 (本Issueでは self-hosted ログのみ)
- ダッシュボード (Grafana / Datadog 連携) → 将来 Issue
- A/B テスト基盤

---

## 設計判断

### Vercel Speed Insights を即採用しない理由

- 別途課金がかかる可能性
- 自前で Vercel Logs に流せば短期的には十分
- ユーザーの判断で後から有効化可能 (将来 Issue)

### PII を絶対に送らない

CLAUDE.md §4 ルールに従い、 payload は **数値メトリクスと識別子ハッシュのみ**。

- `userIdHash`: SHA256(user_id).slice(0, 16) (storage_key と同じ手法)
- `route`: pathname (`/`, `/album` など)、 `[memoryId]` のような params は含めない (匿名化)

### `sendBeacon` を使う理由

ページ離脱直前でも確実に送信できる (fetch だと cancel される可能性)。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | `/v1/metrics/vitals` 追加                |
| 生成型       | `npm run openapi:gen` で更新             |
| データ       | なし (DB 保存しない、ログのみ)           |
| 画面         | layout.tsx に reporter 1 つ追加          |
| API          | 新規 endpoint 1 つ                       |
| テスト       | reporter / route の unit test            |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [ ] `pnpm openapi:gen` 差分コミット
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] DevTools Network で離脱時に `/v1/metrics/vitals` が **sendBeacon で送信** されている
- [ ] payload に PII (email, child name, memory body) が **絶対に含まれない**
- [ ] サインアウト状態でも metric が送れる (公開エンドポイント or anonymous OK にする)

---

## 動作確認手順

```bash
pnpm dev
# 1. /album を開いて操作 → タブを閉じる
# 2. dev server の log に LCP / INP / CLS の数値が出ることを確認
# 3. payload に user_id (生) / email / memory body が **絶対に出ていない** ことを確認
# 4. サインアウト状態で / を開いて metric が送れることを確認
```

---

## セキュリティ・プライバシー考慮

- [ ] PII allowlist: 数値メトリクス + userIdHash + route のみ
- [ ] route から `[memoryId]` のような params を除去 (pathname を sanitize)
- [ ] レスポンスは 201 で空 body (情報漏洩しない)
- [ ] rate limit を route で実装 (1 user 1 分 30 req など、将来 Issue)

---

## リスク

- vitals payload が大量に飛ぶ → 1 ページあたり 5 metric なので問題なし
- log 量増 → Vercel Logs の retention で問題ないレベル

---

## 参考

- ISSUE-016 (baseline、synthetic)
- web-vitals: https://github.com/GoogleChrome/web-vitals
- CLAUDE.md §4 (ログ allowlist)
