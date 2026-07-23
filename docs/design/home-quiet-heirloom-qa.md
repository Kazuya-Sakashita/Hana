---
title: ホーム Quiet Heirloom QA 契約
last_updated: 2026-07-23
owner: kazuya
requires_human_review:
  - accessibility
  - design
  - privacy
---

# ホーム Quiet Heirloom QA 契約

Hana のホームは、記録を急かす入口ではなく、写真 1 枚から静かに戻ってこられる私的なアルバムとして扱う。

## 現在の契約

| topic          | contract                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary action | `/record` への CTA は明確に残し、写真 1 まいから AI 下書きまで 30 秒の低負担価値を伝える。ただし未記録日、連続記録、取り戻しを促す文言は出さない。 |
| Album surface  | recent memories は public feed ではなく、`paper-surface` と `photo-mat` の album slip とする。                                                     |
| Empty state    | 0 件でも責めずに、ありのままの 1 まいから始められる文体にする。                                                                                    |
| Stats          | streak ではなく、しまったページ、現在の月齢、一緒に過ごした日数として読む。                                                                        |
| Accessibility  | 44px tap target、visible focus、decorative thumbnail alt、AA/AAA token contrast を維持する。                                                       |

## Synthetic Screenshot QA 状態

Synthetic screenshot QA では、次の状態を確認する:

- 0 memories: first page CTA, no guilt copy, no feed-like list.
- 1 memory: one album slip and album link.
- 5 memories: horizontal private album shelf with stable 4:5 photo mats.
- Missing cover image: book icon placeholder only, no guessed image description.
- Long child name: stats and avatar do not push controls out of the mobile viewport.
- Viewports: 390x844, 430x932, 768x1024.

## Synthetic Screenshot QA 結果

2026-07-23 に `node scripts/qa/issue-056-home-synthetic-screenshots.cjs` で pass を確認した。
証跡は synthetic HTML から生成し、実アプリの認証済み DOM、network HAR、trace、signed image URL は保存しない。

Artifact paths:

- `docs/design/artifacts/issue-056-home/home-empty-390x844.png`
- `docs/design/artifacts/issue-056-home/home-one-memory-430x932.png`
- `docs/design/artifacts/issue-056-home/home-five-memories-390x844.png`
- `docs/design/artifacts/issue-056-home/home-five-memories-430x932.png`
- `docs/design/artifacts/issue-056-home/home-five-memories-768x1024.png`
- `docs/design/artifacts/issue-056-home/home-long-name-390x844.png`

## 証跡ルール

- Do not use real child photos, names, initials, birthdates, memory titles, memory bodies, image URLs, storage keys, `storage_key` values, prompts, or AI generated memory text in QA artifacts.
- Use only synthetic names such as `はな` or `あお`.
- Use synthetic titles such as `ページ 001`.
- Child name, initial, and avatar `aria-label` values in screenshots or accessibility snapshots must be synthetic only.
- Screenshot evidence must not expose signed image URLs.
- DOM snapshots, network HAR, and Playwright traces are not PR evidence for this issue unless signed URLs and real titles are redacted before saving.
- Authenticated real-data mobile QA remains part of `ISSUE-059`; this issue keeps the synthetic screenshot contract and source-level checks.
