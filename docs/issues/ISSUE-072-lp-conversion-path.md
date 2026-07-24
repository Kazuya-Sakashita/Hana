---
id: ISSUE-072
title: LP の実行可能な CV 導線を決めて接続
priority: P0
status: blocked
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 163
blocked_by:
  - ISSUE-071
external_blockers:
  - 待機リスト、リリース通知、Store URL のどれで検証するかのプロダクト判断
requires_human_review:
  - product
  - privacy
---

## 目的 (Why)

LP が「読んで終わり」にならないよう、Hero と final CTA から実行可能な CV 導線へ進める状態にする。

PRD では LP の目的が価値訴求とダウンロード誘導であり、現在の静的 prototype の Store 準備表示だけでは CV 検証に使えない。

## スコープ (What)

- 待機リスト、リリース通知フォーム、App Store / Google Play URL のどれを公開前検証の primary CTA にするか決める
- Hero、final CTA、nav、Store 表示の文言を統一する
- CTA が自己リンクや準備表示だけで終わらない状態にする
- 取得する情報がある場合は、privacy / consent / logging の扱いを明記する

## やらないこと (Out of Scope)

- 決済導線
- 本番 Store 公開作業
- 実ユーザーのメールや個人情報を証跡に残すこと

## 受け入れ条件 (Acceptance Criteria)

- [ ] LP の primary CTA が実行可能な導線に接続されている
- [ ] secondary CTA が `記録例を見る` など価値理解に接続している
- [ ] CTA のリンク先、入力項目、保存先、ログ方針が説明されている
- [ ] 個人情報を取得する場合、プライバシー説明と同意の扱いが human review 済み
- [ ] CV 導線の QA 手順が `docs/design/current-lp-evaluation.md` または関連 QA doc に追記されている

## Blocked by

- `ISSUE-071`
- 待機リスト、通知、Store URL のどれを使うかの人間判断

## セキュリティ・プライバシー考慮

- メール等を扱う場合、Issue 着手前に privacy review を通す
- 証跡にメール、画像 URL、`storage_key`、prompt、AI 生成本文を含めない

## 参考

- `Hana_PRD_v1.md`
- `docs/design/current-lp-evaluation.md`
