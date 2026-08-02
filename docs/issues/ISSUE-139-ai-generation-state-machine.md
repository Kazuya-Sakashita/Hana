---
id: ISSUE-139
title: AI外部通信をDBトランザクションから分離する
priority: P0
status: done
size: M
created_at: 2026-07-31
github_issue: 298
release_gate: mvp_quality
blocked_by:
  - ISSUE-138
requires_human_review:
  - backend
  - reliability
  - ai_safety
  - operator
---

# ISSUE-139: AI外部通信をDBトランザクションから分離する

## 目的 (Why)

AI vendor通信中にDB transaction、行lock、transaction advisory lockを保持せず、AI遅延が画像削除・同意撤回・他の生成へ連鎖しないようにする。

## スコープ (What)

- 短いtransactionで生成とquota枠を予約する
- 短いtransactionで予約をprocessingへclaimし、同意と画像を再確認する
- AI vendor通信はtransaction外で実行する
- 短いtransactionで同意と画像を再確認し、結果を確定する
- 期限切れreserved / processingをfencing token付きで安全に失敗へ収束させる

## 実装契約

- 永続状態は`reserved → processing → succeeded | failed | discarded`とする
- reservedはquota枠を確保するが、vendor handoff前に失敗した場合はquotaへ加算しない
- processingへ遷移したrequestは成功・失敗・破棄を問わずquotaへ加算する
- claim tokenとleaseで古いrequestによる状態上書きを防ぐ
- quotaのUTC月はreservation作成時刻ではなくprocessing claim時の`quota_counted_at`で決める
- 同意世代はreservation時の`ai_consent_at`をrequest内snapshotとして保持し、claimとfinalizeで一致を確認する
- finalize時に同意が撤回・再同意されていた場合、vendor結果を保存・返却せず`discarded`へ遷移する
- finalize時に画像が削除・紐付け・無効化されていた場合、vendor結果を保存・返却せず`discarded`へ遷移する
- 本文、prompt、画像ID、画像URL、storage key、画像内容は生成logへ追加しない
- rolling deploy中の旧Routeは互換triggerで状態を同期し、旧version drain後に別migrationでtriggerを削除する

## やらないこと (Out of Scope)

- 非同期job queueへの移行
- vendor requestの物理的な途中キャンセル保証
- 生成本文やpromptのDB保存
- API response schemaの変更

## 受け入れ条件 (Acceptance Criteria)

- [x] AI vendor通信中にDB transactionを保持しない
- [x] reserved、processing、succeeded、failed、discardedの遷移が冪等である
- [x] 完了時に所有権、画像有効性、同意世代を再確認する
- [x] 削除・撤回競合時は結果を保存または返却しない
- [x] staleなreserved / processingを安全に回収できる
- [x] vendor遅延、timeout、削除、撤回の並行テストがある
- [x] vendor handoff到達時だけquotaへ加算する既存semanticsを維持する
- [x] OpenAPI、ADR、privacy文書、生成型、実装が一致する

## セキュリティ・プライバシー考慮

- 外部送信開始の論理境界はprocessing claimのcommitとする
- claim後に撤回・削除が確定した場合、外部request自体は完了する可能性があるが、その結果は破棄する
- PIIや生成本文をDB状態、ログ、metrics、テストfixtureへ追加しない
- テストは合成UUID・合成画像・合成本文とローカルPostgreSQLだけを使う

## Rolling deploy契約（実装時の計画）

1. `20260801123000_add_ai_generation_lifecycle`で状態・lease列を追加する
2. `20260801124500_add_ai_generation_quota_compatibility`でquota計上時刻を追加し、既存行を再backfillする
3. 同migrationの互換triggerで、新コード切替前の旧Routeが作る行をprocessing/succeeded/failedへ同期する
4. 新Routeのreservedは混在期間だけ旧quota queryにも見えるよう補正し、新旧同時要求でも20枠を超えないようにする
5. reserved leaseは次のUTC月初を越えないよう上限化し、旧queryでも前月reservedを翌月へ持ち越さない
6. 旧queryは期限切れreservedを同月内で保守的に数えるため、旧versionへの新規routingを停止して短時間でdrainする
7. 新Routeをdeployし、旧versionのrequestがdrainしたことを確認する
8. 互換triggerの削除は別migrationとし、本Issueのdeployと同時には行わない

HanaはISSUE-139統合時点で未公開だったため、旧version trafficのdrainは不要だった。ISSUE-147で
互換triggerと関数を初回公開前に削除し、新しい状態機械だけを残す。

## 検証手順

- 通常検証: `pnpm vitest run tests/integration/v1/ai-generate.test.ts tests/unit/features/ai/quota.test.ts`
- 全体検証: `pnpm pr:gate`
- DB検証は`HANA_QA_SKIP_DOTENV=1`を指定し、`DIRECT_URL`と`DATABASE_URL`の両方を同じ
  `127.0.0.1` / `hana_ci`へ固定してからmigrationと`pnpm qa:issue139:generation-lifecycle-db`を実行する
- DB検証はproduction lifecycle関数を呼び、合成UUID・合成画像metadataだけを作成後に削除する

## 検証結果

- focused test: 38件成功
- local PostgreSQL lifecycle test: 成功（合成データのみ）
- `pnpm pr:gate`: 1109件成功、実DB条件付き1件skip
- 仕様レビュー: GO、残存指摘0件
- standardsレビュー: GO、残存指摘0件

## Deployment state

- 2026-08-01、CLI接続先の確認不備により最初のlifecycle migrationだけが現在のSupabase DBへ先行適用された
- 同日、4項目の人間承認後にquota互換migrationを適用し、未適用0件、checksum、列、index、triggerを再確認した
- 適用内容は状態・quota metadataのbackfillとschema変更。生成本文・画像・promptは読み書きしていない
- 2026-08-02、Hanaが未公開で旧version trafficが存在しないことを確認した。新Routeの公開deployは未実施
- ISSUE-147で互換triggerと関数を初回公開前に削除する
- 最初のmigration fileは適用済みchecksumと一致させるため変更しない

## 人間レビュー

- [x] Backend: 2段migration、互換trigger、deploy順、旧version drain後のtrigger削除方針（2026-08-01承認）
- [x] Reliability: lease fencing、stale回収、UTC月quota、撤回・削除競合（2026-08-01承認）
- [x] AI Safety: claim後は外部requestが完了し得るが、撤回後の結果を保存・返却しない契約（2026-08-01承認）
- [x] Operator: 最初のmigrationがSupabaseへ先行適用済みであることの認識（2026-08-01承認）

## 参考

- GitHub Issue #298
- ISSUE-138
- ADR-0011
- `docs/api-driven-development/security-and-privacy.md`
