---
id: ISSUE-136
title: 退会30日後にDB・Storage・Authを物理削除する
priority: P0
status: review
size: M
created_at: 2026-07-31
github_issue: 295
release_gate: mvp_quality
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
- [x] 実Storage相当のsmokeと運用runbookがある

## 自動検証・専門レビュー

- `pnpm pr:gate`: PASS（155 files / 1210 tests、12 skipped、lint、typecheck、buildを含む）
- fresh local `/hana_ci` migration deploy: PASS（18 migrations）
- `pnpm qa:issue136:purge-db`: PASS（loopback合成Storage/Auth + 専用PostgreSQL）
  - apply未設定のcron requestがread-only dry-runになる
  - Storageのoriginal、thumbnail、preview、orphanを先に削除する
  - AIログ匿名化後だけAuth削除を許可し、最後にProfile関連DBと退会requestを削除する
  - 再実行が`claimed: 0`、`purged: 0`で収束する
- Security / Reliability review: APPROVE
- 実ユーザーデータ、実Storage、実Auth userを使った検証は行っていない

## Human gate

- Privacy / Security / Operationsによる削除順序、30日保持、failed再投入手順は承認済み
- 2026-08-01: 退会受付直後にアクセスを停止し、30日未満では物理削除せず、30日経過後だけを対象にする保持方針を人間が承認
- 2026-08-01: Storage全写真の削除と残存確認、AIログ匿名化、Auth削除、DB削除の順に進め、Storage失敗時は後続を停止する方針を人間が承認
- 2026-08-01: 一時失敗をbackoff付きで再試行し、10回失敗で自動停止して、人間が安全条件を再確認した対象1件だけを再投入する運用方針を人間が承認
- 2026-08-01: 専用staging環境が未作成であることを人間が確認。実ユーザー環境を使用せず、staging作成までsmokeとmergeをHOLD
- 2026-08-03: 既承認のTest Architectureに従い、loopback providerと専用`/hana_ci`だけで合成smokeを代替。明示opt-in・接続先guardが実環境を拒否することを確認
- productionでは`ACCOUNT_PHYSICAL_PURGE_APPLY`を未設定のままデプロイし、migrationとdry-run件数を別途承認するまで削除を開始しない
