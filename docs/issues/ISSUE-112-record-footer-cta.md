---
id: ISSUE-112
title: 記録フッターの主要ボタンを進行状態に同期する
priority: P0
status: review
size: M
created_at: 2026-07-28
github_issue: 247
blocked_by:
  - ISSUE-111
requires_human_review:
  - product
  - accessibility
---

# ISSUE-112: 記録フッターの主要ボタンを進行状態に同期する

## 目的 (Why)

写真選択から保存まで、固定フッターのPrimary CTAを常に「次の一手」と一致させ、初回ユーザーがスクロール位置に左右されず30秒フローを進められるようにする。

## スコープ (What)

- 写真未選択、アップロード中、AI選択待ち、AI生成中、AI生成失敗、保存可能、保存中を明示する
- 固定フッターのPrimary CTAと状態説明を同期する
- AIを使わずに書く経路をAI生成CTAの近くへ配置する
- 色だけに依存しないstatus、disabled、labelを提供する
- ISSUE-111のファネルイベント定義を変更せず維持する

## やらないこと (Out of Scope)

- AI生成API、AI同意文面、Storage構成の変更
- 記録画面全体の再デザイン
- Product Eventの種類や収集内容の変更

## 影響範囲

- `src/app/record/page.tsx`
- `src/features/memories/client/record-footer-state.ts`
- 記録フッターの状態・レイアウト回帰テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] 写真未選択時は「しゃしんを えらぶ」がPrimary CTAになる
- [x] アップロード中は処理中であることが固定フッターから分かり、多重操作できない
- [x] アップロード完了後は「AIで下書きする」がPrimary CTAになり、手動入力も選べる
- [x] AI完了または手動タイトル入力後だけ「このまま 残す」がPrimary CTAになる
- [x] AI失敗時に再試行と手動保存の両方へ進める
- [x] CTA状態を色だけに依存せず、キーボードとスクリーンリーダーで理解できる

## セキュリティ・プライバシー考慮

- AI同意前に外部AIへ写真を送信しない既存のサーバ契約を維持する
- CTA状態とProduct Eventに画像、本文、画像URL、`storage_key`を含めない
- 手動入力経路はAI送信を起動しない

## 検証

- [x] footer state focused tests（35件）
- [x] 390x844 / 320 CSS pxの遮蔽契約
- [x] Product / Frontend-Privacy / Accessibility専門レビュー（3ラウンド）
- [x] `pnpm pr:gate`（93 files / 752 tests）
- [x] `git diff --check`

## 専門レビュー

- Round 1: AI状態の優先順位、写真差し替え競合、320px契約、live regionを修正
- Round 2: 生成中の手入力競合、AI由来情報、quota時の読み上げを修正
- Round 3: Product / Frontend-Privacy / Accessibilityの3名がGO

## 参考

- GitHub Issue #247
- `Hana_PRD_v1.md` の「記録作成画面」「1日の記録フロー」
- `docs/issues/ISSUE-111-product-funnel-events.md`
