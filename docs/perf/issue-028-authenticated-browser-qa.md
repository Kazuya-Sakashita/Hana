# ISSUE-028 認証済みブラウザ画像 QA

## 目的

ISSUE-028 / GitHub Issue #43 の未完項目のうち、 DevTools Network で確認する画像 variant / lazy load を、ログイン済み Chrome から再現可能にする。

この手順とスクリプトは signed URL / storage_key / token / AI 生成本文 / 子ども名を出力しない。結果には件数、 variant 種別、 pass / fail / skipped と、非機密の lazy-load 判定メタデータだけを残す。

## 前提

- 対象アプリが起動している
- Chrome が remote debugging port 付きで起動している
- その Chrome で Hana にサインイン済み
- `/album` に画像付き memory がある
- `/memory/{id}` の path が分かっている

## Chrome 起動例

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/hana-issue-028-cdp-profile \
  http://localhost:3000/sign-in
```

Chrome 上で Google サインインを完了し、 `/album` から画像付きの memory 詳細に遷移できることを確認する。

スクリプトは実行時に Chrome の browser cache を無効化し、既存 cache を clear してから観測する。これは ADR-0012 の `Cache-Control: private, max-age=300` により、再実行時に Network request が省略されることを避けるため。

QA 後は remote debugging 付き Chrome を終了し、専用 profile を削除する。

```bash
rm -rf /tmp/hana-issue-028-cdp-profile
```

## 実行

```bash
HANA_QA_BASE_URL=http://localhost:3000 \
HANA_QA_CDP_URL=http://127.0.0.1:9222 \
HANA_QA_MEMORY_PATH=/memory/<memory-id> \
pnpm qa:issue028:images
```

`HANA_QA_BASE_URL` と `HANA_QA_CDP_URL` には、 credential / query / fragment を含めない。トークン付き URL を渡した場合、スクリプトは実行前に停止する。

`HANA_QA_MEMORY_PATH` を省略すると memory detail の preview 判定は `skipped` になる。

## 判定

| check                     | pass 条件                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `album_authenticated`     | `/album` へ redirect されず表示できる                                                                           |
| `album_thumbnail_variant` | `/album` で signed thumbnail WebP variant request がある                                                        |
| `album_lazy_after_scroll` | native lazy-load の先読み範囲を超えた signed storage 画像が初期 request に含まれず、 scroll 後に request される |
| `memory_preview_variant`  | `/memory/{id}` で signed preview WebP variant request がある                                                    |

`album_lazy_after_scroll` は、Chrome の native lazy-load が近い viewport 外画像を先読みすることを避けるため、`navigator.connection.effectiveType` から採用した native prefetch threshold に 250px の safety margin を足した距離より遠い画像だけを far-offscreen 候補にする。画像枚数が少なく far-offscreen 候補が作れない場合は `skipped` になる。#87 / ISSUE-041 を close するには、QA データを増やして `pass` にするか、データ条件の制約を別途記録する。

## #87 / ISSUE-041 へ残す証跡

スクリプトの JSON 出力をそのまま保存できる。 signed URL は出ない。

```bash
HANA_QA_MEMORY_PATH=/memory/<memory-id> pnpm qa:issue028:images \
  > docs/perf/issue-028-authenticated-network-result-YYYY-MM-DD.json
```

## Lighthouse mobile の安全な記録

Lighthouse の raw report には、監査対象ページや画像 request の URL が含まれる場合がある。
raw report を `docs/` や PR に保存しない。次の wrapper で、Performance 指標と
"Properly size images" の結果だけを sanitized JSON として保存する。

```bash
HANA_QA_BASE_URL=http://localhost:3000 \
HANA_QA_PAGE_PATH=/memory/<memory-id> \
HANA_QA_CDP_PORT=9222 \
pnpm qa:issue028:lighthouse-summary \
  > docs/perf/issue-028-authenticated-lighthouse-summary-YYYY-MM-DD.json
```

すでに手元に raw Lighthouse JSON がある場合も、raw file は commit せず、次のように summary
だけを生成して保存する。

```bash
pnpm qa:issue028:lighthouse-summary -- --input /path/to/local-lighthouse.json \
  > docs/perf/issue-028-authenticated-lighthouse-summary-YYYY-MM-DD.json
```

summary は memory ID / signed URL / token / storage_key / 画像 URL を出力しない。
2026-05-27 baseline との比較は、Lighthouse report が mobile / simulated throttling の場合だけ
summary に含める。
Lighthouse 13 では旧 `uses-responsive-images` が出ない場合があるため、summary helper は
`image-delivery-insight` を画像サイズ/配信監査として扱う。

## 2026-07-24 完了証跡

- `/album` の far-offscreen 画像が初期 request に含まれず、scroll 後に request されることを確認する

画像付き memory が少なく `album_lazy_after_scroll` が `skipped` の場合、GitHub Issue #87 /
ISSUE-041 は open のままにする。2026-07-24 の追加 QA では synthetic QA 画像付き memory で
`album_lazy_after_scroll` が `pass` した。保存済み証跡は
`docs/perf/issue-028-authenticated-network-result-2026-07-24-lazy-pass.json`。
