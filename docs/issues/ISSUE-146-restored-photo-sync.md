---
id: ISSUE-146
title: 復元写真のstateとrefを同期して即時保存競合を防ぐ
priority: P1
status: review
size: S
created_at: 2026-08-01
github_issue: 312
release_gate: mvp_quality
blocked_by:
  - ISSUE-143
---

# ISSUE-146: 復元写真のstateとrefを同期して即時保存競合を防ぐ

## 目的 (Why)

記録下書きから写真を復元した直後に保存すると、画面上では写真が表示済みでも内部refが一時的に空のため「写真をもう一度選ぶ」扱いになる競合を防ぐ。

## スコープ (What)

- 下書き写真の復元時にReact stateと`photosRef`を同じ更新境界で同期する
- 復元直後の保存でも復元済み`image_ids`を使う
- サーバの日付validation error時は日付欄へフォーカスし、写真再選択エラーを出さない
- 既存の複数写真順序、下書き検証、削除処理を維持する

## やらないこと (Out of Scope)

- OpenAPIまたは生成型の変更
- 写真upload、confirm、削除APIの変更
- 下書き保存形式の変更

## 影響範囲

- `src/app/record/page.tsx`の下書き写真復元
- `tests/unit/app/accessible-form-errors.dom.test.ts`の保存・フォーカス回帰テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] 復元写真のstate/ref更新が原子的に扱われる
- [x] 復元直後の保存が`createMemory`を1回呼び、復元済み`image_ids`を送る
- [x] 日付validation error時に日付欄へフォーカスするDOMテストがタイミング待ちに依存しない
- [x] 写真再選択エラーの既存テストが維持される
- [x] focused testの反復実行と`pnpm pr:gate`が成功する
- [x] OpenAPI、生成型、実ユーザーデータを変更しない

## 検証結果

- RED: 復元UIの保存ボタンを表示直後に押すDOMテストで`createMemory`が0回となることを確認
- GREEN: 復元写真をrefとstateへ同じ配列で同期後、対象DOMテスト10件が成功
- 反復: 対象DOMテストを10回実行し10/10成功
- `pnpm typecheck`: PASS
- `pnpm pr:gate`: PASS（format、lint、OpenAPI route map、全テスト、契約QA、production buildを含む）
- `git diff --check`: PASS
- Standards / Spec独立レビュー: GO（指摘0件）

## セキュリティ・プライバシー考慮

- 合成UUIDと合成文言だけをテストに使う
- 画像URL、storage key、画像内容、AI生成本文をログやIssueへ記録しない

## 参考

- GitHub Issue #312
- PR #307のGitHub Actions run `30696272600`
- ISSUE-143
- PRD「写真追加・AI生成画面」「写真から記録を作るフロー」
