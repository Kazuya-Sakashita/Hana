---
id: ISSUE-161
title: AI vendorのdata-handling attestationを確定する
priority: P0
status: blocked
size: S
created_at: 2026-08-03
github_issue: 328
external_blockers:
  - human_privacy_legal_review
  - vendor_organization_settings_access
release_gate: ai_privacy
requires_human_review:
  - privacy
  - legal
  - ai
---

# ISSUE-161: AI vendorのdata-handling attestationを確定する

## 目的 (Why)

AI vendorのdata handlingを一次証跡で確認し、UI/privacyの断定を実際の条件へ揃える。

## スコープ (What)

- retention、training、data sharing、ZDR、削除条件の個別判定
- 確認日、確認者、statusだけの証跡
- UI同意、privacy policy、store表示の同期
- Privacy/Legal/AI reviewer gate

## やらないこと (Out of Scope)

- secret、account ID、画面の個人情報の保存
- review前のpublic AI traffic許可

## 受け入れ条件 (Acceptance Criteria)

- [ ] vendorの現行一次資料と組織設定を確認日、確認者、statusだけで記録する
- [ ] retention、training、optional data sharing、ZDR、削除条件を個別にGO/HOLD判定する
- [ ] secret、account ID、画面の個人情報を証跡へ保存しない
- [ ] UI同意文言、privacy policy、将来のstore privacy表示を同じ証跡版へ揃える
- [ ] Privacy / Legal / AI reviewerがGOにするまでpublic AI trafficをHOLDする

## セキュリティ・プライバシー考慮

組織設定の値やアカウント情報は保存せず、判定statusだけを記録する。

## 参考

- GitHub Issue #328
