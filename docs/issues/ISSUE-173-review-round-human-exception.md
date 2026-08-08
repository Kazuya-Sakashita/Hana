---
id: ISSUE-173
title: レビュー上限の人間承認例外をSHAへ束縛する
priority: P0
status: review
size: M
created_at: 2026-08-05
github_issue: 356
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-173: レビュー上限の人間承認例外をSHAへ束縛する

## 目的 (Why)

通常の再レビュー上限3回を維持しながら、人間が特定のIssue、PR、現在のmain SHA、head SHA、
最大回数へ限定して承認した場合だけ、第4回または第5回の再レビューをfail-closedで受理する。

## スコープ (What)

- 既存v1契約は最大3回のまま維持する
- 第4〜5回専用のstatus-only例外証明schemaを追加する
- 例外証明をIssue ID、PR番号、現在のmain SHA、head SHA、許可上限へ完全一致で束縛する
- 既存の保護された人間承認Environmentを経由し、Hana限定の専用GitHub Appが例外Check Runを発行する
- main固定のgate workflowが専用App、Check名、成功状態、完全一致する証明をfreshに検証する
- unit、CLI、workflow contract、fail-closed回帰テストと運用文書を追加する

## やらないこと (Out of Scope)

- 通常のレビュー上限を一律5回へ変更すること
- caller入力のbooleanや自由文だけで人間承認を代替すること
- Ruleset、repository settings、App権限、secret、auto-merge予約の変更
- production deploy、実DB、実ユーザーデータ、画像、AI生成本文へのアクセス

## 影響範囲

- `scripts/loop-engineer/`のreview例外証明とgate評価
- `.github/workflows/`の保護Environment承認とmain固定検証
- `tests/unit/scripts/`と`tests/unit/app/`の契約・回帰テスト
- ADR-0017と`docs/api-driven-development/`の運用契約

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] v1は第4回以降を従来どおり`review_round_exceeded`で拒否する
- [x] v2は第4回または第5回だけを受け付け、承認上限超過と6回目以降を拒否する
- [x] 例外証明がIssue、PR、main SHA、head SHAのいずれか不一致、欠落、未知fieldならHOLDにする
- [x] 保護された人間承認前に専用Appの成功Checkを発行しない
- [x] mainまたはhead移動、App不一致、Check失敗、未完了、複数の曖昧な証明を成功扱いしない
- [x] review本文、prompt、finding本文、人間の氏名、実ユーザー情報、secretをworkflow input、log、artifactへ保存しない
- [x] 既存の最大3回、HOLD優先、auto-merge非予約を回帰させない

## セキュリティ・プライバシー考慮

人間承認は既存の保護Environment履歴へ残す。専用AppはChecks write、Contents read、Pull requests readの
既存上限を超えない。例外は対象SHAが変わるたび失効し、Ruleset bypassには使わない。workflowとCLIの
出力はIssue ID、PR番号、SHA、最大回数、固定status/reasonだけに限定する。

## 参考

- GitHub Issue #356
- ADR-0017
- ISSUE-165 / #337
- ISSUE-166 / #338
- ISSUE-172 / #354
