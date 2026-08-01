---
id: ISSUE-136
title: 退会30日後にDB・Storage・Authを物理削除する
priority: P0
status: review
size: M
created_at: 2026-07-31
github_issue: 295
release_gate: mvp_quality
blocked_by:
  - ISSUE-135
requires_human_review:
  - privacy
  - security
  - operations
---

# ISSUE-136: 退会30日後にDB・Storage・Authを物理削除する

## 目的 (Why)

退会済み利用者の子どもデータを、規定の猶予期間後にStorageを含めて完全削除する。

## スコープ (What)

- 期限到達対象の安全な選択
- original・thumbnail・previewの削除
- DBとAuth userの削除
- 冪等、部分失敗再試行、dry-run

## 実装契約

- 削除段階を`storage → auth → database`の一方向で永続化し、成功済み段階から再開する
- leaseにはランダムなfencing tokenを使い、古いworkerは次段階へ進めない
- Storage削除成功後かつAuth hard delete前にAI生成ログの`user_id`と`child_id`をnullにし、匿名集計だけを保持する
- 完了時にAccountDeletionRequestを削除し、user IDとreceipt hashを保持しない
- 所有prefixをページング列挙し、Image行がある全variantに加えて未confirm orphanも削除する
- ISSUE-141は退会していない利用者を含む通常時の期限切れorphan清掃を扱う
- 10回失敗は`failed`へ終端し、件数監視後に人間が原因確認して再投入する

## 受け入れ条件 (Acceptance Criteria)

- [x] 猶予期間前のアカウントを削除しない
- [x] 本人所有の全画像variantを漏れなく対象にする
- [x] Storage失敗時にDB/Authを先行削除しない
- [x] 同じ対象への再実行が安全である
- [x] 他ユーザーを誤削除できない統合テストがある
- [x] 件数だけのredacted dry-runを提供する
- [ ] 実Storage相当のsmokeと運用runbookがある

## Blocked by

- ISSUE-135

## 自動検証・専門レビュー

- `pnpm pr:gate`: PASS（142 files / 1118 tests、lint、typecheck、buildを含む）
- Security / Reliability review: APPROVE
- 実ユーザーデータ、実Storage、実Auth userを使った検証は行っていない

## Human HOLD

- Privacy / Security / Operationsによる削除順序、30日保持、failed再投入手順の承認
- staging migration適用後、合成テストアカウント限定でStorage smokeを実施

## Human gate

- 2026-08-01: 退会受付直後にアクセスを停止し、30日未満では物理削除せず、30日経過後だけを対象にする保持方針を人間が承認
- 2026-08-01: Storage全写真の削除と残存確認、AIログ匿名化、Auth削除、DB削除の順に進め、Storage失敗時は後続を停止する方針を人間が承認
- 2026-08-01: 一時失敗をbackoff付きで再試行し、10回失敗で自動停止して、人間が安全条件を再確認した対象1件だけを再投入する運用方針を人間が承認
