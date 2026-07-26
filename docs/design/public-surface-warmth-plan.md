---
title: Public surface warmth plan
last_updated: 2026-07-26
owner: kazuya
parent: PUBLIC-SURFACE-WARMTH
requires_human_review:
  - design
  - accessibility
  - privacy
---

# Public Surface Warmth Plan

`/privacy` と `/lp` を、Hana の本体アプリで成立している Quiet Heirloom のやわらかさへ寄せるための計画。
目的は公開判断ではなく、公開前検証の入口が「冷たい規約ページ / 説明カードの集合」に見えないようにすること。

## 背景

ユーザー確認では、`/privacy` は文字だけが並び冷たく見える。`/lp` も画像やカードにまだ硬さが残り、
実際の Home などで感じる「角が取れた優しい印象」と差がある。

現行 Home は `photo-mat`、`paper-surface`、sage CTA、薄い hairline、控えめな radius の意味分けが強い。
一方で `/privacy` は `policyItems` を罫線で並べる構造に留まり、`/lp` は soft corner 化後も
Before / After と Trust が説明カードの反復に見えやすい。

## 専門レビュー統合

4 名の read-only 専門レビューを統合した結論は次の通り。

- Visual Systems: 色ではなく `photo mat / paper slip / quiet icon` の使い分け不足が主因
- UX / IA: 丸みを増やすより、読む順番と trust の置き場所を Hana らしくする
- Privacy Trust: visual 改善は進めてよいが、`ISSUE-075` の privacy / legal blocker は解除しない
- Frontend / Accessibility: `/privacy` も public surface QA の対象に入れ、実表示で硬さを検知する

## Issue Split

| issue       | title                                                     | status | blocked by               |
| ----------- | --------------------------------------------------------- | ------ | ------------------------ |
| `ISSUE-084` | `/privacy` を Quiet Heirloom trust surface に再設計する   | done   | none                     |
| `ISSUE-085` | `/lp` を keepsake journey と public trust bridge へ寄せる | done   | none                     |
| `ISSUE-086` | Public LP / Privacy visual QA gate を拡張する             | done   | `ISSUE-084`, `ISSUE-085` |

`ISSUE-084` と `ISSUE-085` は完了済み。ただし copy の legal / privacy 承認済み扱いは禁止。
`ISSUE-086` で、実ブラウザと contract で冷たさの回帰を検知する public surface QA gate を追加した。

## Non Goals

- `ISSUE-075` の privacy / legal human review を完了扱いにしない
- 削除連絡先、配信基盤、AI vendor retention、ZDR、完全削除、法務確認済み表現を新たに断定しない
- 角丸を大きくしてかわいくするだけの対応にしない
- 装飾で重要な同意、目的、未確定事項を目立たなくしない
- API / DB / Auth / Storage / OpenAPI を変更しない

## Review Gate

各実装 PR は最大 3 回まで、次の read-only 専門レビューを実施する。

| reviewer                 | gate                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| Product UX / IA          | trust を読む順番、待機リスト前の安心、カード反復の低減                  |
| Visual Systems           | Quiet Heirloom canon、photo mat / paper slip / radius / shadow          |
| Privacy Trust            | 未承認 claim の追加なし、`ISSUE-075` blocker 維持                       |
| Frontend / Accessibility | 390 / 430 / 768 / 1280px、tap target、focus-visible、contrast、overflow |

GO が揃っても `ISSUE-075` は blocked のまま維持する。公開判断は別の human review gate で行う。
