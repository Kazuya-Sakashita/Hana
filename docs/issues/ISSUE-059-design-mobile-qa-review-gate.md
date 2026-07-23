---
id: ISSUE-059
title: デザインモバイル QA とレビューゲート
priority: P0
status: review
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 116
blocked_by:
  - ISSUE-055
  - ISSUE-056
  - ISSUE-057
  - ISSUE-058
requires_human_review:
  - design
  - accessibility
  - privacy
  - release
---

## 目的 (Why)

Quiet Heirloom の画面刷新が、見た目だけでなく Hana MVP の成功条件を満たしているか確認する。
実装後に mobile、keyboard、reduced motion、privacy evidence、30 秒記録の観点で release gate を通す。

## スコープ (What)

- 390px / 430px / 768px / desktop の synthetic screenshot QA を行う
- `/record` の 30 秒手動 QA を記録する
- keyboard / focus / reduced motion / contrast / tap target を確認する
- Design Review Report を作成する
- 専門サブエージェント 3 名のレビュー結果と修正履歴を残す

## やらないこと (Out of Scope)

- 認証済み実データ QA
- production user data を使った screenshot
- 追加の大規模 redesign
- API / DB / Storage の仕様変更

## 影響範囲

| 領域         | 影響                                                 |
| ------------ | ---------------------------------------------------- |
| OpenAPI      | なし                                                 |
| 生成型       | なし                                                 |
| アプリコード | 原則なし。QA で見つかった小修正のみ                  |
| テスト       | Playwright / unit / static checks の必要分           |
| ドキュメント | Design Review Report、manual QA、Issue 正本、PR body |

## 受け入れ条件 (Acceptance Criteria)

- [x] Task Success / 30 秒記録が 4 以上
- [x] Privacy Trust が 4 以上
- [x] Accessibility / Mobile が 3 以上
- [x] core AI path / AI skip path / first consent path の start / finish / target が `quiet-heirloom-design-canon.md` と一致している
- [x] No-Go blocker がない
- [x] synthetic screenshot evidence に PII / image URL / storage_key / AI 生成本文がない
- [x] 専門サブエージェント 3 名のレビューを最大 3 回まで実施し、blocker が解消されている
- [x] `git diff --check` と release-relevant checks が通る

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。blocker が残る場合は merge しない。

## セキュリティ・プライバシー考慮

- QA データは synthetic data のみ
- production account や個人写真を screenshot evidence に使わない
- prompt、AI 生成本文、画像 URL、storage_key は PR 証跡に残さない

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/design-evaluation-rubric.md`
- `docs/design/design-review-playbook.md`
