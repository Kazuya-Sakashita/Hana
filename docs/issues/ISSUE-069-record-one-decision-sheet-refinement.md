---
id: ISSUE-069
title: 記録画面を1判断ずつの下部シート体験へ調整
priority: P1
status: todo
size: M
created_at: 2026-07-24
parent: QUIET-HEIRLOOM-REFINEMENT
github_issue: 155
blocked_by:
  - ISSUE-066
  - ISSUE-067
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

記録画面を参照画像の中央端末に近い「写真を置き、下部シートで確認する」体験へ微調整する。

現状の upload / AI consent / manual writing / save safety は維持しながら、未選択状態、step 表示、AI 下書き、詳細編集の密度を下げ、1 画面 1 判断に近づける。

## スコープ (What)

- 写真未選択状態を静かな camera placeholder として表現する
- bottom sheet footer / safe-area / test id を維持する
- AI を使わない保存 path、初回同意 path、AI 生成 path を維持する
- 詳細編集を低密度に整理する

## やらないこと (Out of Scope)

- AI 送信仕様の変更
- upload / confirm / save API の変更
- AI 同意の省略、または AI を使わない保存導線の弱体化

## 受け入れ条件 (Acceptance Criteria)

- [ ] 写真未選択状態が点線カメラ枠または同等の静かな placeholder として表現されている
- [ ] bottom sheet footer の保存/写真選択 CTA、safe-area、`data-testid="record-bottom-sheet"` が維持されている
- [ ] AI を使わない保存 path、初回同意 path、AI 生成 path がすべて成立する
- [ ] 同意前に写真を送らず、AI 同意文言は送るもの/送らないもの/保持説明を隠さない
- [ ] 詳細編集は折りたたみまたは低密度で、30 秒記録を妨げない
- [ ] Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## セキュリティ・プライバシー考慮

- AI 同意と送信境界は既存 privacy evidence を優先する
- 証跡には実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## 参考

- `ISSUE-066`
- `ISSUE-067`
- `docs/design/record-bottom-sheet-capture-qa.md`
