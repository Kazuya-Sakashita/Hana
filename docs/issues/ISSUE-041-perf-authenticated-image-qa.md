---
id: ISSUE-041
title: 認証済み実データで ISSUE-028 画像 QA を完了する
priority: P1
status: blocked
size: S
created_at: 2026-07-23
parent: PERF
github_issue: 87
external_blockers:
  - authenticated_browser_session
  - qa_image_data
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
- [ ] 出力で `album_lazy_after_scroll` が `pass`
- [x] QA データ不足で `album_lazy_after_scroll` が `skipped` の場合、ISSUE-041 / GitHub #87 を open のまま維持するか、人間承認済み waiver を README と GitHub Issue に記録する
- [ ] Lighthouse mobile の "Properly size images" と LCP / CLS を記録する
- [ ] 2026-05-27 baseline と比較した LCP 結果を記録する

## セキュリティ・プライバシー考慮

- signed URL / query token / storage_key は出力しない
- 子ども/親の氏名、画像 URL、AI 生成本文、メールアドレスは記録しない
- QA 結果は件数、variant 種別、pass / fail / skipped、Lighthouse 指標だけに限定する
- 認証済みセッションの作成は人間操作または明示された QA 用ログイン手段で行う

## 現在の blocker

2026-07-24 に人間操作で認証済み Chrome + CDP セッションが用意され、Network QA のうち
`album_authenticated` / `album_thumbnail_variant` / `memory_preview_variant` は pass した。

残 blocker は次の 2 点である。

- `album_lazy_after_scroll` は、認証済みデータが画像 1 件のみで viewport 外候補を作れず `skipped`
- Lighthouse mobile は未実行。CDP Web Vitals の参考実測は取得済みだが、2026-05-27 baseline
  と同じ Lighthouse simulated throttling ではないため、完了扱いにはしない

## 2026-07-24 進捗

- 保存済み Network QA: `docs/perf/issue-028-authenticated-network-result-2026-07-24.json`
- 保存済み CDP Web Vitals 参考実測: `docs/perf/issue-028-authenticated-cdp-vitals-2026-07-24.json`
- `/album`: signed thumbnail WebP request を確認
- `/memory/{id}`: signed preview WebP request を確認
- CDP Web Vitals 参考実測: `/album` LCP 1.332s / CLS 0、`/memory/{id}` LCP 1.912s / CLS 0.0003
- ただし、Lighthouse mobile audit と lazy load pass は未完のため、GitHub Issue #87 は open のまま維持する

## 参考

- GitHub Issue #87
- GitHub Issue #43
- `docs/issues/ISSUE-028-perf-next-image.md`
- `docs/perf/issue-028-authenticated-browser-qa.md`
- `docs/perf/issue-028-post-merge-qa-2026-07-22.md`
- `docs/perf/issue-028-browser-qa-attempt-2026-07-23.md`
