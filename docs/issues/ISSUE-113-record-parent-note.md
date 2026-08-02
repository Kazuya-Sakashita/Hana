---
id: ISSUE-113
title: AI下書き前の親のひとことを独立入力にする
priority: P0
status: done
size: S
created_at: 2026-07-28
github_issue: 248
blocked_by:
  - ISSUE-112
requires_human_review:
  - product
  - privacy
---

# ISSUE-113: AI下書き前の親のひとことを独立入力にする

## 目的 (Why)

写真だけでは分からない事実や親の実感をAI下書きへ安全に渡し、生成本文を親の言葉として再送する混同をなくす。

## スコープ (What)

- AI下書き前に200文字以内の任意入力を置く
- 親のひとことを生成タイトル・本文と別のstateで保持する
- 初回生成と再生成の`parent_note`には独立入力だけを渡す
- AI生成中は入力をロックし、遅延応答との競合を防ぐ
- 写真差し替え時は写真との文脈不一致を避けるため入力をクリアする

## やらないこと (Out of Scope)

- 親のひとことをDB保存しない
- 会話型AI、文体選択、プロンプト全面改修
- AI生成API、OpenAPI、分析イベントの変更

## 受け入れ条件 (Acceptance Criteria)

- [x] 「写真だけでは分からないこと」を200文字以内で任意入力できる
- [x] 未入力でもAI生成と手動保存を完了できる
- [x] `parent_note`には独立した入力値だけを送り、生成本文を再送しない
- [x] 生成成功・失敗・再生成後も親のひとことが保持される
- [x] AI結果はタイトルと本文だけを更新し、親のひとことを上書きしない
- [x] 入力内容をログ、分析イベント、テスト証跡へ出力しない

## セキュリティ・プライバシー考慮

- 親のひとことはAI同意後の生成リクエストにだけ含める
- 親のひとことをDB保存しない
- ログ、分析イベント、テスト証跡へ入力内容を出力しない
- 実写真、画像URL、`storage_key`、prompt、AI生成本文を証跡に残さない

## 検証

- [x] parent note focused tests（29件）
- [x] キーボード操作、label、description関連付け
- [x] Product / Privacy / Accessibility専門レビュー（2ラウンド）
- [x] `pnpm pr:gate`（97 files / 774 tests）
- [x] `git diff --check`

## 専門レビュー

- Round 1: 同意前の送信境界と、生成成功後の再生成導線を修正
- Round 2: Product / Privacy-AI data flow / Accessibilityの3名がGO

## 参考

- GitHub Issue #248
- `Hana_PRD_v1.md` の「AI機能仕様」
- `docs/openapi/openapi.yaml` の`AiGenerateRequest`
