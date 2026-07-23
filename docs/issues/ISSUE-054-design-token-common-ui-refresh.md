---
id: ISSUE-054
title: Design token and common UI refresh
priority: P0
status: todo
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 111
blocked_by:
  - ISSUE-053
requires_human_review:
  - design
  - accessibility
---

## 目的 (Why)

Quiet Heirloom の方向性を、全画面で再利用できる UI の土台へ落とし込む。
画面ごとに個別調整を始める前に、色、余白、紙片の質感、ボタン、カード、ナビゲーションの
扱いを揃える。

## スコープ (What)

- `src/app/globals.css` の design token を Quiet Heirloom に合わせて調整する
- 共通 UI の radius / shadow / hairline / focus / tap target の使い方を整理する
- bottom navigation と主要 action の visual language を統一する
- token / common UI の静的テストを必要に応じて更新する

## やらないこと (Out of Scope)

- `/record` flow の構造変更
- home / album / detail の画面別 redesign
- API / DB / Storage / AI payload の変更
- 新しい component library の大規模導入

## 影響範囲

| 領域         | 影響                                      |
| ------------ | ----------------------------------------- |
| OpenAPI      | なし                                      |
| 生成型       | なし                                      |
| アプリコード | globals.css、common UI、bottom navigation |
| テスト       | token / accessibility の静的確認          |
| ドキュメント | Issue 正本、必要なら design canon 更新    |

## 受け入れ条件 (Acceptance Criteria)

- [ ] Quiet Heirloom の token が active UI に反映されている
- [ ] body text は 7:1 目標、helper / small text は 4.5:1 以上を維持している
- [ ] primary action の tap target が 44px 以上で維持されている
- [ ] focus-visible と reduced motion の既存契約を壊していない
- [ ] card / paper slip / photo mat の使い分けが実装と design canon で矛盾しない
- [ ] keyboard focus order と safe-area spacing を悪化させていない
- [ ] `git diff --check` と relevant tests が通る

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。

## セキュリティ・プライバシー考慮

- UI token と共通 component の変更に限定し、実データや画像 URL を扱わない
- screenshot evidence は synthetic data のみを使う

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/issues/ISSUE-053-quiet-heirloom-design-canon.md`
