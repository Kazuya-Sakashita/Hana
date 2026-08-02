---
id: ISSUE-144
title: 記録編集中の誤離脱で入力を失わないようにする
priority: P1
status: review
size: S
created_at: 2026-07-31
github_issue: 303
release_gate: mvp_quality
requires_human_review:
  - product_ux
  - accessibility
---

# ISSUE-144: 記録編集中の誤離脱で入力を失わないようにする

## 目的 (Why)

保存済み記録の編集途中に戻る・更新・タブ終了を行っても、意図せず未保存の入力を失わないようにする。

## スコープ (What)

- 変更がある場合だけ、アプリ内の戻る操作で離脱確認を表示する
- 「編集を続ける」と「変更を破棄する」を選べるようにする
- 更新・タブ終了ではブラウザ標準の離脱警告を有効にする
- 保存成功時だけ離脱警告を解除する

## やらないこと (Out of Scope)

- 編集本文のlocalStorage・sessionStorage保存
- 独自文言によるブラウザ標準警告の置き換え
- 記録更新API・DBスキーマの変更

## 影響範囲

- `src/features/memories/client/memory-edit-form.tsx`
- `src/app/memory/[memoryId]/edit/page.tsx`
- `tests/unit/app/memory-edit-form.dom.test.ts`

## 受け入れ条件 (Acceptance Criteria)

- [x] 未変更時は確認なしで離脱できる
- [x] アプリ内の戻る操作で続行または破棄を選べる
- [x] 更新・タブ終了ではブラウザ標準警告を可能な範囲で有効にする
- [x] 保存成功後は離脱警告が残らない
- [x] Dialogのfocus trap、Escape、focus復帰を満たす
- [x] 通信失敗・409時の入力保持を維持する
- [x] 本文をlocalStorage、ログ、分析イベントへ保存しない

## セキュリティ・プライバシー考慮

- 未保存の入力値はReact stateだけに保持する
- 入力値をログ、分析イベント、Storageへ送らない
- ブラウザ標準警告へ入力値や独自メッセージを渡さない

## 検証結果

- `pnpm exec vitest run tests/unit/app/memory-edit-form.dom.test.ts tests/unit/app/album-memory-keepsake.test.ts tests/unit/components/accessible-dialog.dom.test.ts`: 25 tests passed
- `pnpm pr:gate`: 1125 tests passed、2 tests skipped、build passed
- OpenAPI・DB・更新APIの変更なし

## 人間レビュー記録

### Product UX Round 1

- 判定: REQUEST_CHANGES
- 「変更を破棄する」が周囲と近い色で、hover前にボタンと判別しにくい
- 対応:
  - 通常状態から警告色の塗り、2px枠、白文字、影を表示
  - 既存の「下書きを 破棄して閉じる」と同じ破棄操作の視認性基準へ統一
  - hoverに依存せず操作可能と分かるDOM回帰テストを追加

## 人による確認方法

実ユーザーデータを使わず、合成の記録で確認する。

1. 保存済み記録の編集画面を開き、何も変更せず上部または下部の戻る操作を押す。確認なしで記録詳細へ戻ること。
2. タイトル・本文・天気のいずれかを変更し、上部または下部の戻る操作を押す。確認Dialogが表示されること。
3. 「編集を続ける」を押し、入力が残ること。もう一度戻って「変更を破棄する」を押し、記録詳細へ戻ること。
4. 編集中に再読み込みを行い、ブラウザ標準の離脱警告が表示されること。
5. キーボードでDialogを開き、Tab移動、Escapeで閉じる操作、戻るボタンへのfocus復帰を確認すること。
6. 保存成功後は記録詳細へ移動し、離脱警告が残らないこと。

## 参考

- GitHub Issue #303
- GitHub Issue #272（完了）
- PR #293（マージ済み）
