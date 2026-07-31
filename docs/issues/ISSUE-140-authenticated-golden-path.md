---
id: ISSUE-140
title: 認証済みgolden pathを実ブラウザCIで検証する
priority: P1
status: review
size: M
created_at: 2026-07-31
github_issue: 299
release_gate: mvp_quality
requires_human_review:
  - test_architecture
  - privacy
---

# ISSUE-140: 認証済みgolden pathを実ブラウザCIで検証する

## 目的 (Why)

認証Cookieを含む実HTTP境界と主要な記録フローを、合成データだけで継続検証する。

## スコープ (What)

- 写真選択、手書きまたはAI、保存、アルバム、編集競合、サインアウト
- upload再試行、AI timeout、Cookie/header境界
- 失敗時限定かつ合成データ限定の証跡
- PR必須CIゲート

## 受け入れ条件 (Acceptance Criteria)

- [x] synthetic user/dataだけで認証済みgolden pathを実行する
- [x] StorageとAIは契約忠実なfixtureまたはlocal emulatorで決定論的にする
- [x] 通常保存、upload再試行、AI timeout、409競合、sign-outを含む
- [x] Cookie/header過大など実HTTP境界の失敗を検出できる
- [x] traceとscreenshotは失敗時限定かつredactedである
- [x] flaky率、再実行、失敗時調査のrunbookがある
- [x] PR必須ゲートへ接続する

## 検証結果

- production build + localhost PostgreSQL 16 + Chromium: 5 tests passed
- 同じE2E commandを再seedして連続2回実行: 5 tests passed x 2
- environment guard: opt-inなし、外部host、別DB名、URL不一致をseed前に拒否
- 認証Cookieは3KB超7.5KB未満を実計測し、Authorization headerを重複送信しない
- 実ユーザー、実Storage、実Auth、実AI vendorは未使用

## セキュリティ・プライバシー

- 実ユーザー、実写真、実Storage/Auth/AI vendorを使わない
- synthetic sessionはdevelopment + 明示opt-in + loopbackに限定する
- trace、screenshot、consoleへrequest body、画像、署名URL、storage keyを残さない
