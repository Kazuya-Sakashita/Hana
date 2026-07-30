---
id: ISSUE-127
title: 設定から子どもの呼び名と誕生日を編集できるようにする
priority: P1
status: review
size: M
created_at: 2026-07-30
---

## 目的 (Why)

初期登録の誤りを本人が修正し、ホームや月齢表示を正しい内容へ更新できるようにする。

## スコープ (What)

- 設定画面で現在の呼び名と誕生日を編集する
- 既存の子どもプロフィール更新 API を使用する
- 更新後に子どもプロフィールのクライアントキャッシュを更新する

## やらないこと (Out of Scope)

- 複数子ども対応
- プロフィール写真変更
- 家族共有

## 影響範囲

- `PUT /children/{childId}` の説明と入力制約
- 設定画面のプロフィール概要
- ホーム・設定・月齢表示が参照する children query cache

## 受け入れ条件 (Acceptance Criteria)

- [x] 現在の呼び名と誕生日を編集フォームへ表示する
- [x] 空白名、不正日付、未来日を拒否する
- [x] 更新後のホーム、設定、月齢表示へ反映される
- [x] 本人所有のプロフィールだけを変更できる
- [x] 名前と誕生日をログ・分析イベント・証跡へ出力しない
- [x] AI opt-in と送信禁止情報の境界を維持する

## セキュリティ・プライバシー考慮

呼び名と誕生日はログ、分析イベント、テスト証跡へ出力しない。更新 API の既存所有者認可を維持し、AI 同意状態や AI 送信処理は変更しない。

## Review gates

Product UX / Privacy / Accessibility レビュー、`pnpm pr:gate`、`git diff --check`。

## 検証結果

- focused test: 39 passed
- `pnpm pr:gate`: 123 files / 978 tests、契約 QA、production build 成功
- JST 日付境界、保存後の Router Cache refresh、最新プロフィールでの編集開始を回帰テスト済み
