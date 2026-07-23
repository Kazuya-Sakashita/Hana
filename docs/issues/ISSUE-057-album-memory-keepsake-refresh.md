---
id: ISSUE-057
title: Album and memory keepsake refresh
priority: P1
status: todo
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 114
blocked_by:
  - ISSUE-054
  - ISSUE-058
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

アルバム一覧と記録詳細を、SNS feed ではなく「読み返したくなる私的な保存棚」として刷新する。
写真と本文を主役にし、操作や metadata は控えめに置く。

## スコープ (What)

- `/album` の list item を photo mat / paper slip として再設計する
- `/memory/[memoryId]` の hero photo、title、body、metadata、favorite、delete の階層を整理する
- 多件数表示と load more の既存挙動を壊さない
- 写真 alt privacy policy と削除 trust contract を維持する
- album list と memory detail が 1 PR に収まらない場合は、実装前に `ISSUE-057a` / `ISSUE-057b` へ分割する

## やらないこと (Out of Scope)

- API / pagination contract の変更
- memory edit の実装
- restore UI / API の実装
- search / month grouping / recap の追加

## 影響範囲

| 領域         | 影響                                               |
| ------------ | -------------------------------------------------- |
| OpenAPI      | なし                                               |
| 生成型       | なし                                               |
| アプリコード | album page、album list、memory detail              |
| テスト       | album pagination、detail state、accessibility 確認 |
| ドキュメント | Issue 正本、manual QA、design review note          |

## 受け入れ条件 (Acceptance Criteria)

- [ ] album が SNS feed / ranking / public gallery に見えない
- [ ] memory detail で写真と物語が主役になっている
- [ ] favorite / delete / edit placeholder が信頼を壊さない位置にある
- [ ] load more と favorite optimistic update が壊れていない
- [ ] photo alt と delete copy の既存 trust contract を維持している
- [ ] body text 7:1 目標、helper / small text 4.5:1、44px tap target、visible focus を維持する
- [ ] 実装差分が広がりすぎる場合は、album と detail を別 PR に分割している
- [ ] `git diff --check` と relevant tests が通る

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。

## セキュリティ・プライバシー考慮

- 実写真、画像 URL、storage_key、AI 生成本文を evidence に残さない
- detail screenshot は synthetic data のみを使う

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/photo-alt-privacy-policy.md`
- `docs/design/delete-restore-trust-contract.md`
