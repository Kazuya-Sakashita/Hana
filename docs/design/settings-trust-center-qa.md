---
title: Settings Trust Center QA
last_updated: 2026-07-24
owner: kazuya
issue: ISSUE-061
requires_human_review:
  - design
  - accessibility
  - privacy
---

# Settings Trust Center QA

`ISSUE-061` は、settings を「写真・AI・削除・データ管理を確認できる trust center」として扱う。
この文書は、copy、状態別 QA、a11y、証跡境界の確認方針を残す。

## State Matrix

| state                            | expected UI                                             | evidence note                        |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| loading                          | `role="status"` で loading copy を表示                  | screenshot 不要                      |
| fetch error                      | retry CTA と親向け error copy を表示                    | request body や reason は残さない    |
| child registered + AI consent    | `AI の下書きを使えます` と data boundary を表示         | child name / email は synthetic のみ |
| child registered + no AI consent | `AI は同意後だけ使います` と `AI を使わない選択` を表示 | 同意を強制しない                     |
| child missing                    | `記録をはじめられます` と missing child copy を表示     | birthdate は表示しない               |

## Copy Contract

- 「おくるもの」は、しゃしん / 登録した呼び名 / 月齢 / ひにち / てんき / ひとこと。
- 「おくらないもの」は、たんじょうび / メール / じゅうしょ / 位置情報 / 画像URL / presigned URL / 保存先のキー。
- AI は optional。AI を使わずに写真とことばだけで保存できる。
- AI の入出力は、Anthropic の商用 API 条件と Hana のプライバシーレビューに沿って扱う。active UI では確認した範囲だけを表示する。
- zero data retention、完全削除、復元可能期間、近日対応は active UI で約束しない。

## Accessibility QA

- settings page heading は `PageHeader` の `h1` を起点にする。
- loading state は `role="status"` を持つ。
- error state は retry button を 44px 以上の tap target として表示する。
- Trust sections は視覚的な card 群ではなく、上から順に読める情報構造にする。
- 実 DOM の heading / focus / overflow / tap target は `ISSUE-064` の QA v2 で確認する。

## Evidence Policy

- 実写真、実名、メール、生年月日、画像 URL、presigned URL、保存先のキー、prompt、AI 生成本文を証跡に残さない。
- settings は実画面で email / child name を表示するため、screenshot は synthetic account または redacted account のみ許可する。
- production account の screenshot は使わない。
