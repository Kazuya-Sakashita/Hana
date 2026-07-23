---
id: ISSUE-053
title: Quiet Heirloom design canon
priority: P0
status: review
size: S
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 110
requires_human_review:
  - design
  - privacy
  - accessibility
---

## 目的 (Why)

Hana の大幅デザイン見直しで採用する方向性を、実装前のデザイン正本として固定する。
今回のコンセプトは、SNS 的な育児記録ではなく、写真 1 枚から静かに記憶を残す
「私的なアルバム」として扱う。

## スコープ (What)

- `Quiet Heirloom` / `Folded Keepsake` / `Bottom-Sheet Capture` の設計原則を `docs/design/` に文書化する
- コンセプト画像を mood evidence として紐づける
- token / layout / copy / motion / privacy evidence の採用ルールと NG 表現を定義する
- 30 秒記録の計測条件を、実装時に検証できる形で定義する
- 後続 `ISSUE-054` から `ISSUE-059` までの実装順序を追跡できるようにする

## やらないこと (Out of Scope)

- アプリ UI の実装変更
- API / DB / Storage / AI payload の変更
- 生成画像内テキストの本番 copy 採用
- 実ユーザー写真や実データを使った evidence 作成

## 影響範囲

| 領域         | 影響                                                  |
| ------------ | ----------------------------------------------------- |
| OpenAPI      | なし                                                  |
| 生成型       | なし                                                  |
| アプリコード | なし                                                  |
| ドキュメント | design canon、コンセプト画像、Issue index、後続 Issue |

## 受け入れ条件 (Acceptance Criteria)

- [x] Quiet Heirloom のデザイン正本が `docs/design/` にある
- [x] コンセプト画像が mood evidence として参照されている
- [x] 画面別の採用ルールと禁止ルールがある
- [x] 生成画像内の文言は本番 UI copy ではないと明記されている
- [x] AI / privacy / delete / photo alt の source-of-truth precedence が明記されている
- [x] 30 秒記録の start / finish / target が測定可能になっている
- [x] AI 生成本文は中核価値で、secondary なのは手動編集だと明記されている
- [x] 後続 Issue への実装順序が追跡できる
- [x] Evidence policy に PII / image URL / storage_key / prompt / AI 生成本文を残さない
- [x] `git diff --check` が通る

## 検証

- `pnpm format:check`
- `git diff --check`
- 専門サブエージェント 3 名による read-only review
  - Product UX / 30秒記録: round 1 Hold → round 2 Go → round 3 Go
  - Privacy / Trust / Content Safety: round 1 No-Go → round 2 Go → round 3 Go
  - Visual / A11y / Engineering: round 1 Hold → round 2 Hold → round 3 Go

## サブエージェントレビュー方針

最大 3 回まで、次の 3 名相当の read-only review を回す。

| reviewer                         | 見ること                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| Product UX / 30秒記録            | 初回価値、記録完了、見返し、復帰しやすさ、責めない体験                 |
| Privacy / Trust / Content Safety | 写真、AI 同意、削除、証跡、copy が不安や漏洩を増やしていないか         |
| Visual / A11y / Engineering      | ブランド一貫性、mobile、contrast、focus、1 Issue 1 PR で実装できる粒度 |

## セキュリティ・プライバシー考慮

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、storage_key、prompt、AI 生成本文を追加しない
- 子どもの名前が必要な例示は `はな` / `あお` のような synthetic name に限定する
- 生成画像は方向性確認用であり、production evidence ではない

## 参考

- `docs/design/concepts/hana-quiet-heirloom-concept-2026-07-23.png`
- `docs/design/design-inventory-roadmap.md`
- `docs/design/design-evaluation-rubric.md`
- `Hana_PRD_v1.md`
