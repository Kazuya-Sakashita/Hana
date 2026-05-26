---
title: Hana パフォーマンス計測の手引き
last_updated: 2026-05-26
---

# Hana パフォーマンス計測の手引き

このディレクトリには **Hana の体感速度・実 latency を継続計測するための手順とベースライン記録** を残す。

ISSUE-016 以降のパフォーマンス改善 ISSUE は、 PR の本文で **このディレクトリ配下の数値を更新** して「改善前 → 改善後」を残すこと。

---

## 1. 何を計測するか

| カテゴリ      | 指標                                                            | ツール                                               | 計測タイミング          |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| Synthetic     | Lighthouse mobile (Performance / LCP / TBT / CLS / Speed Index) | Chrome DevTools                                      | 各 ISSUE 着手前と完了後 |
| Network       | リクエスト数 / Transfer size 合計 / DOMContentLoaded / Load     | Chrome DevTools Network panel                        | 同上                    |
| API latency   | 主要エンドポイントの p50/p95 (dev サーバ実測)                   | curl + 簡易スクリプト                                | 同上                    |
| Prisma クエリ | 1 リクエストあたりの query 数                                   | `log: ['query']` 一時有効化                          | リファクタ前後          |
| Bundle        | First Load JS / route ごとのサイズ                              | `pnpm build` 出力、将来は `pnpm analyze` (ISSUE-021) | 重い依存追加時          |
| RUM           | LCP / INP / CLS (実ユーザー)                                    | ISSUE-024 で web-vitals 計測                         | 継続                    |

---

## 2. 計測環境の標準

「実機 + スロー回線」を基準にし、 開発機の高速回線で「速い」と錯覚しないようにする。

### Lighthouse mobile

1. Chrome DevTools を開く
2. **Lighthouse** タブ → Mode: **Navigation** / Device: **Mobile**
3. Categories: **Performance** のみで OK (他は別タイミングで)
4. Throttling: **Simulated throttling** (デフォルト)
5. **Analyze page load** を実行

### Network panel スナップショット

1. DevTools **Network** タブを開く
2. Throttling を **Slow 4G** に設定 (右上のドロップダウン)
3. **Disable cache** をチェック (初回着地を再現するため)
4. ハードリロード (`Cmd+Shift+R`)
5. 完了後、 タブのサマリ (XX requests / YY MB / ZZ ms) を記録

### 4× CPU slowdown (任意、 体感を厳しく見るとき)

1. DevTools **Performance** タブ → **CPU**: **4× slowdown**
2. Record で対象ページを操作
3. FCP / LCP / TBT を確認

---

## 3. API latency の取り方

ローカル dev サーバを起動し、 主要エンドポイントを curl で叩く。 サインイン後の cookie を再利用する。

```bash
pnpm dev
# 1. ブラウザで /sign-in → サインイン
# 2. DevTools Application → Cookies → sb-*-auth-token をコピー
# 3. 下記のように curl 実行 (1 回計測の例)
curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' \
  -H 'Cookie: sb-XXX-auth-token=<token>' \
  http://localhost:3000/v1/memories?limit=50
```

簡易ベンチマーク (10 回繰り返し):

```bash
for i in $(seq 1 10); do
  curl -sS -o /dev/null -w '%{time_total}\n' \
    -H 'Cookie: sb-XXX-auth-token=<token>' \
    http://localhost:3000/v1/memories?limit=50
done | sort -n | awk 'NR==5 {p50=$1} NR==9 {p90=$1} END {print "p50="p50, "p90="p90}'
```

→ 数値を `baseline-YYYY-MM-DD.md` に記録。

---

## 4. Prisma クエリログの取り方

`src/lib/db/client.ts` (Prisma client 初期化箇所) の `log` オプションに `'query'` を一時追加:

```ts
// 計測時のみ、 commit はしない
new PrismaClient({ log: ['query', 'warn', 'error'] })
```

dev server を再起動して対象 endpoint を 1 回叩き、 stdout に出る query を数える。

数えたあとは **必ず元に戻す**。 query log は PII 漏洩リスクがあるため本番では絶対に有効化しない。

---

## 5. ベースラインの更新ルール

- **ファイル名**: `baseline-YYYY-MM-DD.md` (実測した日)
- 過去ベースラインは消さず残す (推移を見るため)
- 改善 PR では、 改善 ISSUE の受け入れ条件で参照される数値を **PR 本文に表で書く**
  - 例: `LCP /album: 3.2s → 1.6s (-50%)`

---

## 6. 関連 ISSUE

| ISSUE     | 内容                                                             |
| --------- | ---------------------------------------------------------------- |
| ISSUE-016 | このベースライン取得                                             |
| ISSUE-021 | `pnpm analyze` (bundle analyzer) 導入後、 bundle baseline を更新 |
| ISSUE-024 | Web Vitals 計測基盤 (RUM) — 継続計測の自動化                     |

---

## 7. 注意点

- **PII を計測ログに残さない**: 子ども名 / メール / 画像 URL / AI 出力本文 は NG
- **本番サーバでの計測は禁止**: 個人情報を載せた cookie を使うため、 dev で行う
- **計測時のテストデータは固定化**: memory 50 件 / image 1 枚 / 子ども 1 名 など、 ばらつきを抑える
