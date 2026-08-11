---
id: ISSUE-193
title: recovery-protocol-v2への一度限りの移行ガバナンスを定義する
priority: P0
status: review
size: S
created_at: 2026-08-11
github_issue: 390
requires_human_review:
  - security
  - operations
  - repository_owner
---

# ISSUE-193: recovery-protocol-v2への一度限りの移行ガバナンスを定義する

## 目的 (Why)

ISSUE-177 / PR #389のRound 5 Terminal HOLDを失敗終了として保持したまま、旧campaignを再開せずに
`recovery-protocol-v2`の設計へ一度だけ移行できる、有限で監査可能なガバナンス境界を定義する。

## スコープ (What)

- Terminal HOLDをcandidate revisionとreview campaignの不可逆な終端として定義する
- Round 5 terminal manifestと6件の未解決findingをv2の必須入力として固定する
- 一度限り・再委任不能な`protocol_v2_transition_grant`の束縛項目と消費規則を定義する
- independent successorで許可する入力と、再利用を禁止する旧artifactを固定する
- G0〜G3の直列deliverable、有限review budget、program全体の停止条件を定義する
- `AGENTS.md`、ADR、Codex自動開発Runbook、Issue永続コピーを同期する

## やらないこと (Out of Scope)

- PR #355、#361、#389またはIssue #362の更新、再review、Check更新、workflow dispatch、merge
- Round 6、Round 5結果のreset、reviewer追加・交代
- runtime、OpenAPI、GitHub Actions、GitHub App、Environment、Rulesetの変更
- recovery credential発行、succession消費、Check success投影、activation
- 旧branch-only code、commit、diff、schema、test、fixture、review、Check、attestationの再利用

## 影響範囲

- `AGENTS.md`のTerminal HOLDとsolo-maintainer境界
- ADR-0017のHOLDからTerminal HOLDへの状態遷移
- ADR-0018の一度限りの独立後継設計
- Codex自動開発RunbookのG0〜G3実行順と停止条件
- Round 5 terminal manifestとv2 charterの機械可読な整合性

OpenAPI、生成型、runtime、database、workflowおよびGitHub設定には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] Round 5 terminal manifestのsource SHA、run、Check、3役結果、6件のfinding IDを固定する
- [x] Terminal HOLDの適用単位と、Issue / PR / branch / head変更でreview budgetがresetされないことを定義する
- [x] transition grantをprogram、protocol major、main、manifest、requirements、threat model、scope、review budget、期限、nonceへ束縛する
- [x] 許可入力と禁止artifactをprovenance規則として定義する
- [x] G0〜G3を固定し、各deliverableをD1、V1、最大1 remediation、V2へ制限する
- [x] V2でP0/P1が残る場合はprogram全体をTerminal HOLDとし、自動後継を禁止する
- [x] transition時のagent評価を独立した人間reviewまたはtrusted receiptと表現しない
- [x] v2の特権activation前にtrusted verifier真正性とreplay防止を必須化する
- [x] OpenAPI、runtime、workflowを変更しない
- [x] 文書整合test、Issue registry、format checkが成功する
- [x] D1の3 roleが同じscope / threat model / failure modelをread-onlyで確認する

## セキュリティ・プライバシー考慮

このIssueは安全条件をwaiveしない。solo Repository Ownerの意図確認と3 role agentのread-only advisoryを
区別し、悪意または侵害されたOwnerへの耐性は主張しない。既存の別trust-domain verifierが利用できない
場合でも、credential発行、succession消費、Check更新より前にはtrusted verifierを必須とする。

実ユーザーデータ、画像、画像URL、storage key、AI prompt、生成本文、secretは扱わない。

## D1 advisory record

- Security: GitHub / OIDC / supply-chain観点から、Round 6ではなく一度限りの別protocol majorとすることを提案
- Operations: safetyとlivenessを分離し、Terminal HOLDの適用単位と有限停止を確認
- Repository Owner perspective: G0〜G3のIssue分割、1 Issue / 1 PR、D1 / V1 / V2予算を確認
- Authority: 3 roleともread-only advisoryであり、独立した人間reviewまたはtrusted receiptではない

## Post-head transition gates

次はlocal文書のcheckboxを更新して証明しない。final headを変更しない外部のstatus-only記録として残す。

1. V1で3 roleが同じexact headをfresh contextで評価する
2. P1がある場合だけfinding backlogを固定し、1 bounded remediation後にV2を行う
3. V2のP0 / P1が0件であることを確認する
4. Repository Ownerがcurrent main、final head、各digestへexact-boundしたtransition判断を行う
5. G0のmerge後にgrantを`accepted`として一度だけ消費する

## 動作確認

1. terminal manifestのSHA-256とcharter内の参照digestが一致することを確認する
2. 文書整合testで固定SHA、6 finding、review budget、grant未発行、activation blockedを確認する
3. Issue registryとPrettierでfrontmatterおよび文書形式を確認する
4. diffがG0の文書、manifest、文書整合testだけであることを確認する

## 参考

- GitHub Issue #390
- GitHub Issue #362
- Draft PR #389
- ADR-0017
- ADR-0018
- `docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json`
- `docs/governance/loop-engineer/recovery-protocol-v2-charter.json`
