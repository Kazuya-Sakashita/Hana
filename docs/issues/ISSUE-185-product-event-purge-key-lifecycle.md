---
id: ISSUE-185
title: ProductEventの退会purgeとHMAC key lifecycleを実装する
priority: P0
status: blocked
size: M
created_at: 2026-08-07
github_issue: 375
blocked_by:
  - ISSUE-192
release_gate: privacy
requires_human_review:
  - security
  - privacy
---

# ISSUE-185: ProductEventの退会purgeとHMAC key lifecycleを実装する

## 目的 (Why)

退会者の仮名化actorを保持期限まで残さずpurgeし、HMAC keyのrotation後も削除対象を漏れなく
特定できるprivacy lifecycleを実装する。

## スコープ (What)

- server管理のactor key versionとcohort境界
- 現行・旧key versionをまたぐProductEvent purge
- key rotation、旧key失効、削除可能期間の運用契約
- purge失敗時のfail-closedな退会物理削除
- 合成DBデータによるrotation / retry / partial failure test

## やらないこと (Out of Scope)

- product funnelのthreshold変更
- pilot参加者の同意管理
- raw user ID、HMAC pepper、実eventの証跡保存

## 受け入れ条件 (Acceptance Criteria)

- [ ] ProductEventから削除対象actorを全key versionで解決できる
- [ ] 退会物理削除前に対象ProductEventをpurgeし、完了をstatus-onlyで監査できる
- [ ] purge失敗時はprofile / authの最終削除を進めず、retry可能な状態を保つ
- [ ] key rotationのcohort境界、旧key保持期限、失効、緊急rotation手順を文書化する
- [ ] event依存cohortが複数actor key versionを跨いだ場合に結合せず、evidenceをHoldへ無効化する
- [ ] purge前にcensor status固定を試み、失敗時はevidenceをHoldにするが利用者の退会purgeは遅らせない
- [ ] rotation前後、retry、partial failure、対象なしを合成DBデータで検証する
- [ ] ログ、CI、Issue、PRへraw user ID、actor hash、HMAC pepperを出力しない
- [ ] SecurityとPrivacyの人間reviewが同じevidence versionを確認する

## セキュリティ・プライバシー考慮

actor hashも仮名化された個人データとして扱う。pepper自体やactor対応表をrepo、ログ、CI artifactへ
保存せず、purge対象の解決と実行は最小権限のserver jobに限定する。

## 参考

- GitHub Issue #375
- ISSUE-192（ISSUE-188置換）
- ISSUE-159
- ISSUE-160
- ISSUE-162
