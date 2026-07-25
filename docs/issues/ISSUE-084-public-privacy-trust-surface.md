---
id: ISSUE-084
title: /privacy を Quiet Heirloom trust surface に再設計する
priority: P1
status: todo
size: M
created_at: 2026-07-26
parent: PUBLIC-SURFACE-WARMTH
github_issue: 190
blocked_by: []
external_blockers: []
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

`/privacy` は内容は安全側だが、現状は文字と罫線が並ぶだけで、Hana の Home にあるような `paper-surface`、`photo-mat`、余白、静かな trust surface の印象とつながっていない。待機リスト登録前に読むページとして、冷たい規約ページではなく「安心して確認できる紙片」に再設計する。

## スコープ (What)

- `/privacy` に `data-public-privacy` を付与し、public surface QA の対象にしやすくする
- 冒頭に、公開前検証・メールだけ・目的限定・レビュー中であることを短く示す trust summary を置く
- `取得する情報 / 利用目的 / 管理方法 / 第三者提供 / 停止・削除` を罫線だけでなく `paper-surface` / `paper-slip` として scan できる構造にする
- `/lp` へ戻る導線を 44px 以上の quiet pill として整える
- 現行 copy の安全側の範囲を保ち、未確認 claim は追加しない

## やらないこと (Out of Scope)

- privacy / legal review の完了扱い
- 削除依頼の正式連絡先決定
- メール配信基盤の確定表現
- AI vendor retention、ZDR、完全削除、法務確認済みの断定
- API / DB / Auth / Storage / OpenAPI の変更

## 受け入れ条件 (Acceptance Criteria)

- [ ] `/privacy` が罫線テキストのみではなく、summary + detail の2段階で読める
- [ ] policy item が `paper-surface` / `paper-slip` / hairline / warm canvas により Hana らしい trust surface として見える
- [ ] 既存の目的限定 copy を超える新しい legal / vendor / deletion claim を追加していない
- [ ] `ISSUE-075` の privacy / legal blocker を解除扱いにしていない
- [ ] 390 / 430 / 768 / 1280px で横スクロール、重なり、tap target 不足がない
- [ ] 証跡に実写真、画像 URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## 検証

- `pnpm exec vitest run tests/unit/app/prelaunch-privacy-policy.test.ts`
- `pnpm qa:issue075:lp-public -- --mode=contract`
- 必要に応じて app mode で `/privacy` を 390 / 430 / 768 / 1280px 確認

## 専門レビュー観点

| reviewer        | framework                     | 確認観点                                                         |
| --------------- | ----------------------------- | ---------------------------------------------------------------- |
| UX / IA         | trust before conversion       | 待機リスト登録前に、安心材料が読みやすい順で置かれているか       |
| Visual Systems  | Quiet Heirloom canon          | 文字だけの規約ではなく、薄い紙感と余白で読めるか                 |
| Privacy Trust   | claim safety                  | 未承認の保持、削除、配信基盤、AI vendor claim を増やしていないか |
| Frontend / A11y | responsive / focus / contrast | 44px target、focus-visible、contrast、overflow が守られているか  |
