---
id: ISSUE-063
title: Record Saved Moment and Memory Landing
priority: P1
status: todo
size: M
created_at: 2026-07-24
parent: PRODUCT-EXPERIENCE-V2
github_issue: 133
blocked_by:
  - ISSUE-060
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

`/record` を「保存できるフォーム」から、「写真が 1 ページになった」と感じられる体験へ進める。

## スコープ (What)

- 保存成功後の着地点を `/album` 直行から再評価する
- 新規保存後の memory detail / album landing の quiet feedback を設計する
- 初回記録の場合の「最初のページ」体験を検討する
- 30 秒計測の finish 条件を必要に応じて更新する

## やらないこと (Out of Scope)

- AI 生成品質の変更
- 画像アップロード基盤の変更
- export / photobook の導入

## 受け入れ条件 (Acceptance Criteria)

- [ ] 保存完了時に、記録がページになったことが伝わる
- [ ] 30 秒 core path の目標を壊さない
- [ ] failure recovery で入力と写真 preview を失わない
- [ ] reduced motion でも完了 feedback の意味が伝わる
- [ ] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない

## 参考

- `Hana_PRD_v1.md`
- `docs/design/quiet-heirloom-design-canon.md`
