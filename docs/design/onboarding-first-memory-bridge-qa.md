---
issue: ISSUE-062
title: Onboarding to First Memory Bridge QA
last_updated: 2026-07-24
---

# Onboarding to First Memory Bridge QA

`/onboarding` は、子どもプロフィール登録を事務処理で終わらせず、最初の記録へ自然につなぐ画面として確認する。

## State Matrix

| state                | expected UI / behavior                                                                                 | evidence rule                        |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| loading              | `role="status"` でページ読み込み中を伝える                                                             | screenshot 不要                      |
| form                 | 名前と生年月日の入力を最小にし、submit CTA は 44px 以上を保つ                                          | 入力値を入れる場合は synthetic のみ  |
| submit pending       | `ページを 用意しています…` を表示し、二重送信を防ぐ                                                    | screenshot 不要                      |
| validation / failure | 入力を失わず、親を責めない集約 copy を `role="alert"` で伝え、field error は `aria-describedby` で結ぶ | birthdate 実値は残さない             |
| success              | 成功見出しへ focus を移し、常設 `role="status" aria-live="polite"` で状態変化を伝える                  | synthetic child name のみ            |
| already registered   | 既存登録として最初の記録 CTA を表示し、race 復帰時は見出しへ focus を移す                              | synthetic child name のみ            |
| query error          | `role="alert"` で読み込み失敗を伝え、再試行 CTA を残す                                                 | account / request details は載せない |

## Copy Contract

- success の主文脈は「最初のページ」へつなぐ。
- first memory CTA は `/record` に向ける。
- failure / validation copy は「入力はそのまま」を先に伝え、validation reason や provider error を直出ししない。
- 未実装のプロフィール編集、複数子ども、AI consent 解除、後日変更を active UI で約束しない。

## Accessibility QA

- success state は見出しに `tabIndex={-1}` と focus 移動を持つ。
- success / already registered state は `role="status" aria-live="polite"` の常設 live region を持つ。
- validation error は `role="alert"` の集約メッセージを持つ。
- query error は `role="alert"` と heading label を持つ。
- primary CTA は mobile で viewport 下部の thumb zone に寄り、safe area を避ける。
- reduced motion 環境でも意味が失われない。状態変化は motion だけに依存しない。

## Evidence Policy

- 実写真、実名、メール、生年月日、画像 URL、presigned URL、`storage_key`、prompt、AI 生成本文を載せない。
- child name が必要な証跡は `はな` / `あお` など synthetic name のみを使う。
- 生年月日フィールドを含む screenshot は、値を空にするか synthetic date のみに限定する。
- production account の screenshot は使わない。
