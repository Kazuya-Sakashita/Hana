---
issue: ISSUE-063
title: Record Saved Moment and Memory Landing QA
last_updated: 2026-07-24
---

# Record Saved Moment and Memory Landing QA

`/record` は保存後に `/album` へ直行せず、作成された `/memory/{memoryId}?saved=1` を開く。保存完了の意味は toast と memory detail の notice の両方で伝え、motion だけに依存しない。saved notice は detail data の取得を待たずに表示し、戻る導線と重ならない通常フローに置く。

## State Matrix

| state                    | expected UI / behavior                                                                                | evidence rule                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| save pending             | `ページを しまっています…` を表示し、二重送信を防ぐ                                                   | screenshot 不要                    |
| save success             | success toast を出し、作成済み `/memory/{id}?saved=1` に遷移する                                      | memory id は redacted 表記のみ     |
| memory detail saved view | `role="status" aria-live="polite"` の saved notice を hero photo の前、かつ data fetch 待ちの外に出す | synthetic child name のみ          |
| normal memory detail     | `saved=1` がない場合は saved notice を出さず、通常の keepsake detail を保つ                           | 実写真・実名を使わない             |
| validation failure       | rollback し、入力と写真 preview は `/record` 上に残す                                                 | 入力内容・画像 URL は載せない      |
| save failure             | rollback し、`入力はそのままです` copy と toast で復帰できることを伝える                              | request / response body は載せない |

## Copy Contract

- success toast は「できたページを ひらきます」と伝える。
- saved detail notice は「保存できました」「ページをしまいました」を伝える。
- 「毎日続けましょう」「連続記録」「失う前に」などの pressure copy は使わない。
- AI generated label や prompt を保存後の主役にしない。

## Accessibility QA

- saved notice は `role="status" aria-live="polite"` を持つ。
- saved notice は visible text で意味が伝わる。reduced motion でも同じ意味が残る。
- saved state の戻る導線は notice と重ならない通常フローに置く。
- detail の戻るボタン、favorite、delete 操作は既存のキーボード操作を維持する。
- 実 viewport の tap target / overflow / safe area は ISSUE-064 で read-only smoke する。

## Timing Contract

- core AI path / AI skip path の finish は success toast または `/memory/{id}?saved=1` 到達で判定する。
- memory detail の画像取得は保存完了後の見返し体験であり、30 秒 core path の必須完了条件には含めない。

## Evidence Policy

- 実写真、実名、メール、生年月日、画像 URL、presigned URL、`storage_key`、prompt、AI 生成本文を載せない。
- child name が必要な証跡は `はな` / `あお` など synthetic name のみを使う。
- memory id は `{memoryId}` または redacted UUID として表記する。
- production account の screenshot / trace / HAR は使わない。
