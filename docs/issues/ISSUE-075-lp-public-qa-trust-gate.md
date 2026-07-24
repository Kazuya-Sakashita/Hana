---
id: ISSUE-075
title: LP 公開前 QA と trust human review gate
priority: P0
status: blocked
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 166
blocked_by:
  - ISSUE-072
  - ISSUE-073
  - ISSUE-074
external_blockers:
  - 公開 copy の privacy / legal review
requires_human_review:
  - privacy
  - legal
  - accessibility
  - release
---

## 目的 (Why)

LP を公開候補にする前に、実ブラウザ QA と trust copy の人間レビューを通し、子どもの写真・AI 利用に関する不安や誤解を増やさない状態にする。

## スコープ (What)

- 390 / 430 / 768 / 1280px の実ブラウザ QA
- 横スクロール、重なり、折返し、tap target、focus order、contrast、reduced motion の確認
- image payload と LCP 目安の確認
- AI 同意、送るもの / 送らないもの、保持、学習、削除保証に関する公開 copy の human review
- 公開用 evidence に実データや機微情報が残らないことの確認

## やらないこと (Out of Scope)

- Store 申請
- 本番デプロイ
- 事前登録データの運用開始

## 受け入れ条件 (Acceptance Criteria)

- [ ] 390 / 430 / 768 / 1280px の QA evidence がある
- [ ] 横スクロール、重なり、tap target 不足がない
- [ ] focus-visible、reduced motion、viewport zoom が確認されている
- [ ] image payload が公開 LP として許容できる
- [ ] privacy / legal review 済みの trust copy だけが公開候補に残っている
- [ ] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## Blocked by

- `ISSUE-072`
- `ISSUE-073`
- `ISSUE-074`
- 公開 copy の privacy / legal review

## セキュリティ・プライバシー考慮

- Trust blocker は visual score で相殺しない
- 未確認の vendor retention / training / deletion claim は公開候補から除外する

## 参考

- `docs/design/ai-consent-privacy-evidence.md`
- `docs/design/settings-trust-center-qa.md`
- `docs/design/current-lp-evaluation.md`
