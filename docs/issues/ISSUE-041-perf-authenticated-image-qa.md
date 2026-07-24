---
id: ISSUE-041
title: 認証済み実データで ISSUE-028 画像 QA を完了する
priority: P1
status: done
size: S
created_at: 2026-07-23
parent: PERF
github_issue: 87
external_blockers: []
requires_human_review:
  - privacy
  - image
---

## 目的 (Why)

ISSUE-028 / GitHub Issue #43 で `next/image` 移行と静的確認は完了した。
一方で、認証済み実データ環境でしか確認できない DevTools Network / Lighthouse / LCP
の証跡は未完である。

この Issue では、認証済みブラウザと画像付き QA データが用意できた時点で、
残 QA だけを安全に実施・記録する。

## スコープ (What)

- `pnpm qa:issue028:images` を認証済み Chrome + CDP で実行する
- `/album` の画像 request が signed thumbnail WebP variant であることを確認する
- `/memory/{memoryId}` の画像 request が signed preview WebP variant であることを確認する
- `/album` の viewport 外画像が初期ロードに含まれず、scroll 後に取得されることを確認する
- Lighthouse mobile で "Properly size images" が悪化していないことを確認する
- `/memory/{memoryId}` の LCP を `docs/perf/baseline-2026-05-27.md` と比較する

## やらないこと (Out of Scope)

- `next/image` 移行コードの再実装
- 画像 variant 生成 pipeline の変更
- 認証 bypass や本番データの直接改変
- signed URL / token / storage_key / 個人情報をログ・Issue・PR に残すこと

## 影響範囲

| 領域         | 影響                                                     |
| ------------ | -------------------------------------------------------- |
| OpenAPI      | なし                                                     |
| 生成型       | なし                                                     |
| アプリコード | なし                                                     |
| QA           | 認証済みブラウザ、画像付き memory、Lighthouse 再計測     |
| ドキュメント | `docs/perf/issue-028-authenticated-browser-qa.md` の手順 |

## 受け入れ条件 (Acceptance Criteria)

- [x] 認証済み Chrome が CDP port 付きで起動し、`/album` を表示できる
- [x] `pnpm qa:issue028:images` の JSON 出力を `docs/perf/` に保存する
- [x] 出力で `album_authenticated` が `pass`
- [x] 出力で `album_thumbnail_variant` が `pass`
- [x] 出力で `memory_preview_variant` が `pass`
- [x] 出力で `album_lazy_after_scroll` が `pass`
- [x] QA データ不足で `album_lazy_after_scroll` が `skipped` の場合、ISSUE-041 / GitHub #87 を open のまま維持するか、人間承認済み waiver を README と GitHub Issue に記録する
- [x] Lighthouse mobile の "Properly size images" と LCP / CLS を記録する
- [x] 2026-05-27 baseline と比較した LCP 結果を記録する

## セキュリティ・プライバシー考慮

- signed URL / query token / storage_key は出力しない
- 子ども/親の氏名、画像 URL、AI 生成本文、メールアドレスは記録しない
- QA 結果は件数、variant 種別、pass / fail / skipped、Lighthouse 指標、非機密の lazy-load 判定メタデータだけに限定する
- 認証済みセッションの作成は人間操作または明示された QA 用ログイン手段で行う

## blocker 解消

2026-07-24 に人間操作で認証済み Chrome + CDP セッションが用意され、Network QA のうち
`album_authenticated` / `album_thumbnail_variant` / `memory_preview_variant` は pass した。

その後、signed URL / token / storage_key / 子ども名を出力しない synthetic QA 画像付き memory を追加し、
`album_lazy_after_scroll` も pass した。

- 保存済み lazy-load pass 証跡: `docs/perf/issue-028-authenticated-network-result-2026-07-24-lazy-pass.json`
- `album_lazy_after_scroll`: farOffscreen=9 / initial=0 / after scroll=9 / minDistanceFromViewportPx=1575 / nativePrefetchThresholdPx=1250 / safetyMarginPx=250

Lighthouse raw report には signed URL / token が含まれる可能性があるため、2026-07-24 に
sanitized summary helper `pnpm qa:issue028:lighthouse-summary` を追加した。Lighthouse 実測時は
raw report を commit せず、summary JSON だけを `docs/perf/` に保存する。

## 2026-07-24 進捗

- 保存済み Network QA: `docs/perf/issue-028-authenticated-network-result-2026-07-24.json`
- 保存済み Network QA lazy pass: `docs/perf/issue-028-authenticated-network-result-2026-07-24-lazy-pass.json`
- 保存済み CDP Web Vitals 参考実測: `docs/perf/issue-028-authenticated-cdp-vitals-2026-07-24.json`
- 保存済み Lighthouse sanitized summary: `docs/perf/issue-028-authenticated-lighthouse-summary-2026-07-24.json`
- Lighthouse sanitized summary helper: `scripts/qa/issue-028-lighthouse-summary.mjs`
- `/album`: signed thumbnail WebP request を確認
- `/memory/{id}`: signed preview WebP request を確認
- `/album`: far-offscreen 画像が初期 request に含まれず scroll 後に request されることを確認
- CDP Web Vitals 参考実測: `/album` LCP 1.332s / CLS 0、`/memory/{id}` LCP 1.912s / CLS 0.0003
- Lighthouse mobile sanitized summary: performance score 0.91、LCP 2.532s、CLS 0.0003、
  `image-delivery-insight` pass、2026-05-27 baseline 比 LCP -88.9%
- 受け入れ条件は満たしたため、GitHub Issue #87 は PR review / CI 後に close 可能

## 参考

- GitHub Issue #87
- GitHub Issue #43
- `docs/issues/ISSUE-028-perf-next-image.md`
- `docs/perf/issue-028-authenticated-browser-qa.md`
- `docs/perf/issue-028-post-merge-qa-2026-07-22.md`
- `docs/perf/issue-028-browser-qa-attempt-2026-07-23.md`
