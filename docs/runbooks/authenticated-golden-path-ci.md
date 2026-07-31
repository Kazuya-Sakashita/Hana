# 認証済み Golden Path CI Runbook

## 目的

ISSUE-140 の実ブラウザゲートを、実ユーザー・実写真・実Supabase・実AI vendorへ接続せずに運用する。

## CI構成

- Chromium 1 project、worker 1、CI retry 1回
- production build + `next start`
- GitHub Actionsの使い捨てPostgreSQL 16
- QAプロセス内だけで起動する偽Supabase Auth HTTP service
- Storage uploadとAI requestはPlaywrightの契約fixture
- Memory保存、一覧、編集409、sign-outは実Route Handlerと実PostgreSQL
- 認証CookieはSupabase SSR互換のchunked synthetic session（3KB超、7.5KB未満）

productionコードへE2E認証バイパスを追加しない。fixtureはloopbackでだけ待受け、固定の合成IDと合成token以外を受け付けない。

## 実行

ローカルPostgreSQLへmigrationを適用し、次を実行する。

```bash
HANA_SYNTHETIC_E2E=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/hana_ci \
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/hana_ci \
pnpm e2e:build
pnpm exec playwright install chromium
HANA_SYNTHETIC_E2E=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/hana_ci \
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/hana_ci \
pnpm e2e
```

明示opt-in、`DATABASE_URL`と`DIRECT_URL`の完全一致、loopback host、専用DB名`hana_ci`をbuild・server・seed・cleanup前に共通guardで検査する。条件外ではデータ操作を始めない。

## 検証シナリオ

1. chunked認証Cookieでホームを開き、実Memory APIで保存してアルバムに表示する
2. Storage PUTを1回だけ503にし、同じ写真の再送後に手書き保存する
3. AI fixtureを停止し、ブラウザ時計を30秒進めてtimeoutと再試行導線を確認する
4. 編集画面の背後で実HTTP PUTを行い、画面側の409、入力維持、最新確認ボタンを確認する
5. 実`POST /sign-out`後、保護ページがsign-inへ戻ることを確認する

## 失敗時の確認

- retry前の初回失敗を確認し、retry成功だけでflakyを閉じない
- `test-results/issue-140`の失敗項目名と合成スクリーンショットだけを見る
- Cookie、Authorization、request body、signed URL、storage key、AI本文をログやIssueへ貼らない
- traceとvideoは無効。スクリーンショットとHTML reportは失敗時だけ7日保持する
- 原因を `auth_fixture` / `database` / `browser` / `application` / `selector` の固定分類で記録する

同じ失敗を3回繰り返したら、再実行を止めてIssueへ固定分類と失敗stepだけを報告する。

## Flaky率

- GitHub Actions直近50回（または14日）のfirst-attempt failureを月1回確認する
- 目標は2%未満
- retryで成功した回もfirst-attempt failureへ数える
- 2%以上なら必須ゲートから外さず、selector・時刻固定・fixture state・server readinessを修正する

## 証跡ポリシー

- 使用可能: 合成UUID、固定step名、status、elapsed、失敗分類、合成画面の失敗時スクリーンショット
- 禁止: 実ユーザー、実写真、氏名、メール、request body、Cookie値、token、signed URL、storage key、prompt、AI生成本文
- artifact保持は7日。成功時はartifactを作らない

## Rollback

E2E自体の障害で全PRが停止した場合も、required checkを管理画面で迂回しない。fixture修正PRを優先し、緊急時はworkflow内のE2E stepを明示的にrevertする。
