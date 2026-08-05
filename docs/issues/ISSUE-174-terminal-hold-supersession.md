---
id: ISSUE-174
title: Terminal HOLD後の後継実装を証明付きで再開する
priority: P0
status: review
size: M
created_at: 2026-08-05
github_issue: 358
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-174: Terminal HOLD後の後継実装を証明付きで再開する

## 目的 (Why)

Terminal HOLDへ到達したIssueを番号変更だけで再開する抜け道を防ぎつつ、旧設計を廃棄して
実質的に再設計する場合だけ、証明付きの後継Issue / PRを開始できる回復経路を定義する。

## スコープ (What)

- `review_lineage_id`による旧Issue / PRと後継Issue / PRの系統管理
- 旧Issue / PR / head、新Issue / PR、現在のmain / head、固定finding IDへ束縛したstatus-only証明
- 保護Environment、GitHub署名付きOIDC、Hana専用App Checkによる人間承認
- merge gate、AGENTS.md、ADR-0017、Runbook、controller、workflow contract test
- 後継は1回だけとし、後継もTerminal HOLDなら再後継を禁止

## やらないこと (Out of Scope)

- ISSUE-172のコード修正、PR #355のpush、更新、merge、自動close
- 6巡目以降の許可、Ruleset bypass、未解決findingの上書き
- GitHub App権限、Ruleset、repository settings、auto-merge設定の変更
- production、DB、Storage、実ユーザーデータへのアクセス

## 影響範囲

- `scripts/loop-engineer/`の後継証明controllerとmerge gate
- `.github/workflows/`の保護承認workflow
- `tests/unit/scripts/`と`tests/unit/app/`の契約・回帰テスト
- AGENTS.md、ADR-0017、Codex自動開発Runbook

OpenAPI、アプリruntime、DB、Storageには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] ISSUE-172 / PR #355は後継証明があっても`terminal_review_limit`でHOLDする
- [x] Issue番号変更、新PR、cherry-pickだけではreview lineageをリセットできない
- [x] 後継証明が旧Issue / PR / head、新Issue / PR、main / head、lineageのいずれか不一致ならHOLDする
- [x] `main_sha_race`、`gh_cli_pagination_contract`、`status_metadata_allowlist`を後継へ必ず引き継ぐ
- [x] caller boolean、自由文、label、ローカル自己申告、通常Actions App jobを承認にしない
- [x] 旧PRのclosed / unmerged / 固定headと旧review / Check証跡の非再利用を確認する
- [x] 2回目の後継、未知field、stale Check、別App、証明再利用をHOLDにする
- [x] 後継はRound 1から開始するが、通常3巡、例外最大5巡、6巡目禁止を維持する
- [x] `pnpm pr:gate`が成功する

## セキュリティ・プライバシー考慮

証明はIssue ID、PR番号、SHA、固定finding ID、succession番号だけを扱う。PR title / body / comment、
review本文、actor名、実ユーザー情報、secret、tokenはworkflow input、Check output、artifactへ保存しない。
Checks write、Contents read、Pull requests readの既存App権限を超えない。

## Rollback

導入commitをrevertし、後継証明を無効扱いへ戻す。ISSUE-172 / PR #355のTerminal HOLDは維持する。

## 参考

- GitHub Issue #358
- ISSUE-172 / #354 / PR #355
- ISSUE-173 / #356 / PR #357
- ADR-0017
