---
id: ISSUE-062
title: Onboarding to First Memory Bridge
priority: P1
status: todo
size: M
created_at: 2026-07-24
parent: PRODUCT-EXPERIENCE-V2
github_issue: 134
blocked_by:
  - ISSUE-060
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

登録完了後にホームへ自動遷移するだけでなく、最初の記録へ自然につながる初回体験を作る。

## スコープ (What)

- 登録成功後の CTA と copy を「最初のページ」へつなぐ
- 初回記録への導線を mobile thumb zone に寄せる
- birthdate などの sensitive data を screenshot evidence に残さない運用を明記する
- loading / success / error の live region と focus を確認する
- 登録成功 state で支援技術利用者にも状態変化が伝わるよう、focus 移動または常設 live region を検討する

## やらないこと (Out of Scope)

- 認証方式の変更
- 複数子ども対応
- AI consent API の変更

## 受け入れ条件 (Acceptance Criteria)

- [ ] 登録完了から最初の記録へ迷わず進める
- [ ] 失敗時に入力を失わず、親を責めない copy を維持する
- [ ] 主要 CTA が mobile で押しやすい位置にある
- [ ] 登録成功後の状態変化が screen reader / keyboard 利用者にも伝わる
- [ ] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない

## 参考

- `Hana_PRD_v1.md`
- `docs/design/product-experience-v2-plan.md`
