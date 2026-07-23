---
id: ISSUE-060
title: プロダクト体験 V2: 約束整合と共通シェル基盤
priority: P0
status: review
size: M
created_at: 2026-07-24
parent: PRODUCT-EXPERIENCE-V2
github_issue: 131
blocked_by: []
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

Quiet Heirloom の大幅刷新後、見た目だけでなく「Hana が何を約束し、何が今できるか」を active UI で揃える。
特に、未実装の編集・共有・export・復元などを約束しないようにし、settings / onboarding に共通のプロダクトシェルを導入する。

## スコープ (What)

- Product Experience V2 の計画を `docs/design/` に残す
- `AppShell` / `FocusedShell` / `PageHeader` / surface 系の最小共通 component を追加する
- `/settings` を trust surface の入口として整理する
- `/onboarding` の成功・既存登録・form 表示を共通 shell に寄せる
- home など active UI の未実装 promise を保守的な文言に直す
- 静的 test で promise / trust copy / shell 利用を検査する

## やらないこと (Out of Scope)

- OpenAPI / DB / Storage の変更
- AI 同意解除 API、export、account deletion、family sharing の実装
- `/record` の自動 AI 下書き開始
- 保存後 landing の大きな flow 変更
- 実DOM Playwright QA v2 の追加

## 影響範囲

| 領域         | 影響                                              |
| ------------ | ------------------------------------------------- |
| OpenAPI      | なし                                              |
| 生成型       | なし                                              |
| アプリコード | product shell / settings / onboarding / home copy |
| テスト       | static contract test、既存 copy guard             |
| ドキュメント | Product Experience V2 計画、Issue 正本、README    |

## 受け入れ条件 (Acceptance Criteria)

- [x] active UI で未実装の編集・共有・export・削除復元を約束しない
- [x] settings が「今できること」と「準備中」を分けて表示している
- [x] AI / 写真の送るもの・送らないものが既存 privacy evidence と矛盾しない
- [x] settings copy が zero data retention、完全削除、復元可能などを約束しない
- [x] `AppShell` / `FocusedShell` / `PageHeader` / surface component が追加され、settings / onboarding で使われている
- [x] static test が promise / trust copy / component contract を検査している
- [x] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない
- [x] `git diff --check` と relevant checks が通る

## レビュー方針

専門サブエージェントで Product UX / Privacy-Trust / Visual-A11y-Engineering の read-only review を行い、
blocker が残る場合は最大 3 回まで修正と再レビューを回す。

### レビュー結果

- Product UX / 30 秒記録 / プロダクト整合: Go
- Privacy / Trust / Content Safety: Go
- Visual / A11y / Engineering: Go
- warning は `登録した呼び名` / `presigned URL` / 証跡禁止対象の明確化、および `ISSUE-062` / `ISSUE-064` への引き継ぎとして反映済み
- `pnpm pr:gate`: pass

## セキュリティ・プライバシー考慮

- 実写真、production data、画像 URL、`storage_key`、prompt、AI 生成本文は証跡に残さない
- settings の privacy copy は、法務/公式 evidence と human review が済むまで強い保証表現にしない
- child birthdate や email は実データ screenshot に残さない

## 参考

- `docs/design/product-experience-v2-plan.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/ai-consent-privacy-evidence.md`
- `docs/design/design-mobile-qa-review-gate.md`
