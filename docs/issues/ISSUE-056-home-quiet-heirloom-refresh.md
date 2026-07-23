---
id: ISSUE-056
title: ホームの Quiet Heirloom 刷新
priority: P1
status: review
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 113
blocked_by:
  - ISSUE-054
  - ISSUE-058
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

ホームを「今日も記録しなければ」という入口ではなく、静かに記憶を置きに戻れる場所へ刷新する。
記録 CTA は明確に保ちながら、feed 感や継続圧を避ける。

## スコープ (What)

- `/` home の hero / recent memories / empty state / stats の見せ方を Quiet Heirloom に合わせる
- recent memories を feed ではなく album slip として見せる
- empty state と return copy を責めない文体へ整理する
- synthetic screenshot QA を残す

## やらないこと (Out of Scope)

- `/record` の flow 変更
- album pagination の仕様変更
- API / DB / Storage の変更
- streak / reminder / notification の追加

## 影響範囲

| 領域         | 影響                                      |
| ------------ | ----------------------------------------- |
| OpenAPI      | なし                                      |
| 生成型       | なし                                      |
| アプリコード | `src/app/page.tsx`、home component 周辺   |
| テスト       | home state / accessibility の必要分       |
| ドキュメント | Issue 正本、manual QA、design review note |

## 受け入れ条件 (Acceptance Criteria)

- [x] 記録 CTA が明確で、かつ未記録日への圧になっていない
- [x] recent memories が SNS feed / ranking / streak に見えない
- [x] empty state が初回記録へ自然につながる
- [x] stats は「連続記録」ではなく「一緒に過ごした日数」などの非圧力表現で扱う
- [x] body text 7:1 目標、helper / small text 4.5:1、44px tap target、visible focus を維持する
- [x] synthetic screenshot QA が残っている
- [x] `git diff --check` と relevant tests が通る

## 実装メモ

- `/` hero は「写真1まいから、AIの下書きまで30秒」を低負担価値として伝え、未記録日や streak を出さない。
- 0 memories では album 導線を隠し、初回ページ作成へ自然につなぐ。
- recent memories は `paper-surface` / `photo-mat` の album slip として扱い、feed / ranking / like 表現を置かない。
- stats は「しまったページ」「いまの月齢」「一緒に過ごした日数」に整理する。
- synthetic screenshot QA は `docs/design/artifacts/issue-056-home/` に PNG 証跡を残す。

## 検証結果

- `node scripts/qa/issue-056-home-synthetic-screenshots.cjs` pass
- `pnpm test -- tests/unit/app/home-quiet-heirloom.test.ts tests/unit/app/photo-alt-privacy-policy.test.ts tests/unit/app/accessibility-baseline.test.ts tests/unit/app/quiet-heirloom-common-ui.test.ts` pass
- `pnpm pr:gate` pass
- 専門サブエージェント 3 名 review: round 1 HOLD、round 2 GO

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。

## セキュリティ・プライバシー考慮

- home の証跡に実データ、画像 URL、storage_key、AI 生成本文を残さない
- child name は synthetic name のみを使う

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `src/app/page.tsx`
