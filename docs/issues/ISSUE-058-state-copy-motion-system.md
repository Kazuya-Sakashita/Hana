---
id: ISSUE-058
title: 状態文言と静かなモーション体系
priority: P0
status: todo
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 115
blocked_by:
  - ISSUE-054
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

loading / empty / error / success / toast / dialog の状態表現を Hana の文体で統一する。
失敗や待ち時間が、親を責めたり、技術的に突き放したりしないようにする。
画面別 redesign の前に copy / motion ledger の置き場を固定し、後続 Issue が一時 copy を増やさないようにする。

## スコープ (What)

- 主要画面の loading / empty / error / success copy を整理する
- `docs/design/quiet-copy-motion-ledger.md` を更新し、surface / state / adopted copy / blocked wording / evidence-safe note を残す
- toast / dialog の tone と action label を Quiet Heirloom に合わせる
- AI waiting と save success の motion / reduced-motion 方針を実装または文書化する
- technical reason を親向け copy に変換する方針を守る

## やらないこと (Out of Scope)

- AI 生成品質の変更
- API error schema の変更
- notification / reminder の追加
- 複雑な animation library の導入

## 影響範囲

| 領域         | 影響                                        |
| ------------ | ------------------------------------------- |
| OpenAPI      | なし                                        |
| 生成型       | なし                                        |
| アプリコード | loading、empty、error、toast、dialog state  |
| テスト       | copy guard、state rendering、reduced motion |
| ドキュメント | Issue 正本、copy ledger、manual QA          |

## 受け入れ条件 (Acceptance Criteria)

- [ ] 主要 state copy が責めない文体で統一されている
- [ ] UI に HTTP status や internal reason が直接出ない
- [ ] AI waiting と save success が quiet motion / reduced-motion に対応している
- [ ] `docs/design/quiet-copy-motion-ledger.md` に採用文言、禁止表現、safe evidence fields が残っている
- [ ] ledger に prompt、AI 生成本文、request / response body を貼っていない
- [ ] Evidence に PII / image URL / storage_key / prompt / AI 生成本文がない
- [ ] `git diff --check` と relevant tests が通る

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。

## セキュリティ・プライバシー考慮

- error evidence は構造化 reason の分類に留め、request body や AI 生成本文を残さない
- copy で削除復元や AI retention を過剰約束しない

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/design-evaluation-rubric.md`
