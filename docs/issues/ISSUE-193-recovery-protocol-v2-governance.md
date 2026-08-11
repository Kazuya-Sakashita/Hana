---
id: ISSUE-193
title: recovery-protocol-v2への一度限りの移行ガバナンスを定義する
priority: P0
status: review
size: M
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
- grant binding inputs、frozen artifact provenance、fixed principal review historyの再計算可能性

OpenAPI、生成型、runtime、database、workflowおよびGitHub設定には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] Round 5 terminal manifestのsource SHA、run、Check、3役結果、6件の無損失finding recordを固定する
- [x] Terminal HOLDの適用単位と、Issue / PR / branch / head変更でreview budgetがresetされないことを定義する
- [x] transition grantをstable repository / Owner、audience、program、main / final tree、全digest、期限、nonceへ束縛する
- [x] 許可treeと禁止commit / object / blob / patch / pathを再計算可能なprovenance規則として定義する
- [x] G0〜G3を固定し、各deliverableをD1、V1、最大1 remediation、必須V2へ制限する
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
- Principal set: `/root/gov_security_counsel`、`/root/gov_liveness_architect`、`/root/gov_delivery_designer`
- Record: charterのD1 objectへ2026-08-11T05:40:17Zにretrospective Owner aggregationとして固定
- Authority: 3 roleともread-only advisoryであり、独立した人間reviewまたはtrusted receiptではない

## V1 finding record

- Reviewed base: `e6c891ecde1ba3f51b739361d3cd3de4433835a3`
- Reviewed head: `90d42a9b7ee131191995412191d1a962c4ad07fb`
- Results: Security P1=4、Operations P1=5、Repository Owner perspective P1=4、全role HOLD
- Consolidated backlog: 5 P1 + 2 P2
- Finding-set digest: `3b1ca32844c28b2a05ae01ff833188df0352204a69b6c241c61855b911e7069a`
- GitHub record: PR #391 comment `5249358797`
- Remediation: batch 1 / 1を消費し、次は追加V1ではなくV2だけを許可

## Post-head transition gates

次はlocal文書のcheckboxを更新して証明しない。final headを変更しない外部のstatus-only記録として残す。

1. V1で3 roleが同じexact headをfresh contextで評価する（完了、上記status-only record）
2. finding backlogを固定し、1 bounded remediationを行う（完了、追加batch禁止）
3. V2のP0 / P1が0件であることを確認する
4. Repository Ownerがcurrent main / tree、final head / tree、各digestへexact-boundしたJSON-only grantを発行する
5. G0 merge後のparent / tree readbackから`ACCEPTED_CONSUMED`を導出する

## 動作確認

1. terminal manifest、binding inputs、provenance、各canonical projectionのSHA-256を再計算する
2. 文書整合testで6 finding全文、grant lifecycle、fixed principal、必須V2、finite budget、main freshnessを確認する
3. Issue registryとPrettierでfrontmatterおよび文書形式を確認する
4. diffがG0の文書、manifest、文書整合testだけであることを確認する

## 参考

- GitHub Issue #390
- GitHub Issue #362
- Draft PR #389
- ADR-0017
- ADR-0018
- `docs/governance/loop-engineer/frozen-artifact-provenance.json`
- `docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json`
- `docs/governance/loop-engineer/recovery-protocol-v2-binding-inputs.json`
- `docs/governance/loop-engineer/recovery-protocol-v2-charter.json`
