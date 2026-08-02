---
id: ISSUE-126
title: 保存済み記録のタイトル・本文・天気を編集できるようにする
priority: P0
status: done
size: M
created_at: 2026-07-30
github_issue: 272
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - product_ux
  - accessibility
  - security
---

# ISSUE-126: 保存済み記録のタイトル・本文・天気を編集できるようにする

## 目的 (Why)

保存後の誤りを本人が安全に整え直せるようにし、長く残す育児記録への不安と作り直しの負担を減らす。

## スコープ (What)

- 記録詳細から編集画面へ移動できる
- タイトル、本文、天気の現在値を表示する
- 既存の `PUT /memories/{memoryId}` で変更した項目を更新する
- 更新成功後は記録詳細へ戻り、ホームとアルバムのキャッシュを更新する
- キャンセル時は更新せず記録詳細へ戻る
- 入力エラーと通信失敗を表示し、入力値を保持する

## やらないこと (Out of Scope)

- 写真の追加、削除、並べ替え
- 記録日と子どもの変更
- 編集履歴
- AI再生成

## 影響範囲

- `/memory/[memoryId]`
- `/memory/[memoryId]/edit`
- memory update client
- memory detail / edit UI tests
- memories API authorization regression tests

## 受け入れ条件 (Acceptance Criteria)

- [x] 本人所有の記録だけを編集できる
- [x] タイトル、本文、天気の既存値を表示して更新できる
- [x] 空白、文字数、天気の既存契約をクライアントとAPIで維持する
- [x] 更新後に詳細、ホーム、アルバムへ反映される
- [x] キャンセル時は変更されない
- [x] 通信失敗時も入力を失わない
- [x] 他ユーザー更新拒否とPII非ログの回帰テストがある

## セキュリティ・プライバシー考慮

- 編集画面と更新APIの双方で認証を要求する
- 更新APIの既存所有権チェックを維持する
- タイトル、本文、天気、子どもの情報をログへ出さない
- エラー表示は安定したreasonとフィールドpathだけで分岐する

## 検証

- [x] memory edit focused tests
- [x] memories API authorization / PII log regression tests
- [x] Product UX / Accessibility / Security専門レビュー
- [x] `git diff --check`
- [x] `pnpm pr:gate`

## 専門レビュー記録

### Round 1

- Product UX: dirty項目限定送信、集中編集画面、保存中入力、一覧サムネイル保持、キャンセル履歴、編集導線を指摘
- Accessibility: 保存中通知、必須表示、見出し順、pending回帰テストを指摘
- Security / Privacy / Backend: PUTとDELETEの競合、部分更新、一覧キャッシュ、403/404の存在判別を指摘
- 対応:
  - 初期値との差分だけを送信し、変更なしでは保存不可に変更
  - 編集ルートでBottomNavを非表示にし、本文直下にも編集導線を追加
  - 保存中は入力をreadOnlyにし、`aria-busy`とlive regionを追加
  - 一覧キャッシュは編集項目だけをmergeしてサムネイルを保持
  - PUTを所有者・未削除条件付きtransaction更新へ変更
  - 403/404統一と更新世代は #282 / #283 へ分離
- 判定: REQUEST_CHANGES

### Round 2

- Product UX: 上部戻る導線の履歴置換漏れを指摘
- Accessibility: live regionがbusyフォーム内にある点を指摘
- Security / Privacy / Backend: 空文字初期値のdirty判定と404時の一覧再検証を指摘
- 対応:
  - 上部・下部のキャンセルを履歴置換へ統一
  - live regionをbusyフォーム外へ移動
  - 初期空文字を同じ規則で正規化
  - 404時は入力を保持したまま一覧キャッシュをinvalidate
- 判定: REQUEST_CHANGES

### Round 3

- Product UX: APPROVE
- Accessibility: APPROVE
- Security / Privacy / Backend: APPROVE
- focused tests: 6ファイル / 66件成功
- 全体tests: 118ファイル / 954件成功
- `pnpm pr:gate`、production build、`git diff --check`成功
- 判定: APPROVE
