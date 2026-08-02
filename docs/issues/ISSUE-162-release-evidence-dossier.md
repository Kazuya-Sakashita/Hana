---
id: ISSUE-162
title: Release evidence dossierと最終Go・No-Goを確定する
priority: P0
status: blocked
size: M
created_at: 2026-08-03
github_issue: 332
blocked_by:
  - ISSUE-105
  - ISSUE-148
  - ISSUE-149
  - ISSUE-150
  - ISSUE-151
  - ISSUE-152
  - ISSUE-153
  - ISSUE-154
  - ISSUE-155
  - ISSUE-156
  - ISSUE-157
  - ISSUE-158
  - ISSUE-159
  - ISSUE-160
  - ISSUE-161
release_gate: final_release
requires_human_review:
  - product
  - security
  - privacy
  - release
---

# ISSUE-162: Release evidence dossierと最終Go・No-Goを確定する

## 目的 (Why)

公開可否を人間が判断できるrelease dossierへ全gateと証跡を集約する。

## スコープ (What)

- main SHA、CI、Issue、migrationのstatus-only固定
- 各専門reviewと運用証跡の参照
- accepted risk/waiver契約
- blockerによるGo禁止
- rollback/forward-fix、canary、incident連絡

## やらないこと (Out of Scope)

- ISSUE-105のHOLD判定変更
- secret、接続文字列、実ユーザー情報、画像、生成本文の保存
- 人間承認なしのGo判定

## 受け入れ条件 (Acceptance Criteria)

- [ ] 対象main SHA、最新CI、未解決Issue、migration状態をstatus-onlyで固定する
- [ ] Security、Privacy、AI、Accessibility、Reliability、Productの人間review結果を記録する
- [ ] SLO/alert、restore drill、performance budget、5名pilotの合否を参照する
- [ ] accepted riskとwaiverにはowner、理由、期限、再確認条件を必須にする
- [ ] 必須blockerが1件でも未完了ならGoを選択できない
- [ ] rollbackまたはforward-fix基準、公開後canary、incident連絡手順を確定する
- [ ] secret、接続文字列、実ユーザー情報、画像、生成本文をdossierへ含めない
- [ ] 最終Go/No-GoはProduct、Security/Privacy、Release operatorの人間承認で確定する

## セキュリティ・プライバシー考慮

証跡はstatus-onlyに限定し、最終Go/No-Goは3者の人間承認で確定する。

## 参考

- GitHub Issue #332
- ISSUE-105
