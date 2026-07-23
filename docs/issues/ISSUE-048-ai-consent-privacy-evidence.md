---
id: ISSUE-048
title: AI consent privacy evidence alignment
priority: P0
status: done
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 101
blocked_by:
  - ISSUE-047
requires_human_review:
  - privacy
  - legal
  - ai
---

## 目的 (Why)

AI 同意 dialog と settings trust surface の vendor claim を、現在確認できる公式情報に合わせる。
Hana は子どもの写真を外部 AI に送るため、`zero data retention` や「学習に使われない」を
契約・設定確認なしに断定しない。

## スコープ (What)

- active UI から unsupported な training / retention claim を外す
- settings に AI 同意状態と送信データの最小説明を追加する
- Anthropic / Claude の公式情報を evidence doc に残す
- security / privacy guide の release blocker を「証跡未記録」から「人間 review 未完了」へ更新する
- unsupported claim の再混入を静的テストで防ぐ

## やらないこと (Out of Scope)

- AI payload / prompt / provider の変更
- AI 同意の revoke UI
- privacy policy / terms 本文の法務ドラフト
- OpenAPI / API / DB / storage 仕様の変更

## 影響範囲

| 領域         | 影響                                          |
| ------------ | --------------------------------------------- |
| OpenAPI      | なし                                          |
| 生成型       | なし                                          |
| アプリコード | record AI consent copy、settings trust card   |
| テスト       | AI consent privacy copy / evidence の静的確認 |
| ドキュメント | ISSUE-048 正本、evidence doc、security guide  |

## 受け入れ条件 (Acceptance Criteria)

- [x] active UI が zero data retention を約束していない
- [x] active UI が契約確認前の training non-use を断定していない
- [x] AI は opt-in で、送るデータ / 送らないデータが active UI で確認できる
- [x] vendor retention / training-use evidence に URL と確認日が残っている
- [x] public MVP 前の human privacy / legal review gate が残っている
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## 検証

- `pnpm test -- tests/unit/app/ai-consent-privacy-evidence.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 子どもの写真・名前・メール・画像 URL・storage_key・AI 生成本文は docs / tests に追加しない
- vendor claim は 2026-07-23 時点の公式公開情報に限定する
- 最終的な privacy policy / terms / App Store label は人間 review gate として残す

## 参考

- GitHub Issue #101
- `docs/design/ai-consent-privacy-evidence.md`
- `docs/api-driven-development/security-and-privacy.md`
- `docs/adr/0011-ai-generation.md`
