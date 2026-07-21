# Hana Issue Index

このファイルは、Codex が `docs/issues/` の現在地と次に進める Issue を短く把握するための入口です。

各 Issue の正本は `docs/issues/ISSUE-<number>[suffix]-*.md` です。この README は派生ビューなので、Issue の status / frontmatter を更新したら合わせて更新します。

---

## Source Of Truth

- Issue 本文: `docs/issues/ISSUE-<number>[suffix]-*.md`
- プロダクト仕様: `Hana_PRD_v1.md`
- API 契約: `docs/openapi/openapi.yaml`
- 開発手順: `AGENTS.md`
- 自動開発手順: `docs/api-driven-development/codex-automation-runbook.md`

---

## Frontmatter Schema

| field                   | required | values                                                 | meaning                                              |
| ----------------------- | -------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `id`                    | yes      | `ISSUE-XXX` / `ISSUE-XXXa`                             | Issue ID。PR title は `[ISSUE-XXX] <summary>` にする |
| `title`                 | yes      | short Japanese title                                   | Issue の要約                                         |
| `priority`              | yes      | `P0` / `P1` / `P2`                                     | P0 は MVP / safety gate、P1 は改善、P2 は後続改善    |
| `status`                | yes      | `todo` / `in_progress` / `review` / `done` / `blocked` | 現在状態                                             |
| `size`                  | yes      | `S` / `M` / `L` / `M+`                                 | 半日〜2日を超える場合は分割候補                      |
| `created_at`            | yes      | `YYYY-MM-DD`                                           | Issue 作成日                                         |
| `parent`                | no       | Issue ID / initiative key                              | 親 Issue または横断テーマ                            |
| `release_gate`          | no       | `mvp_core` / `mvp_quality`                             | release readiness との関係                           |
| `blocked_by`            | no       | issue list                                             | 完了または人間 waiver が必要な依存                   |
| `requires_human_review` | no       | topic list                                             | privacy / security / release など人間確認の種類      |

`ready_for_codex` は新規自動化 Issue に残してよいが、ready queue の正本にはしません。実際の ready 判定は下のルールから派生させます。

---

## Status Snapshot

2026-07-21 時点:

| status        | count | notes                                                     |
| ------------- | ----- | --------------------------------------------------------- |
| `todo`        | 6     | ready queue / blocked queue を参照                        |
| `in_progress` | 0     | 並行実行枠は空き                                          |
| `review`      | 9     | foundation 5件 + automation setup 3件 + release readiness |
| `done`        | 22    | archive を参照                                            |
| `blocked`     | 0     | README 上の注意 Issue は下記 blocker 表へ記載             |

---

## Status Rules

| status        | meaning                                                |
| ------------- | ------------------------------------------------------ |
| `todo`        | 受け入れ条件があり、未着手                             |
| `in_progress` | 現在の branch / task で作業中                          |
| `review`      | 実装・検証が終わり、PR review または人間確認待ち       |
| `done`        | merge 済み、または Issue の目的が完了済み              |
| `blocked`     | 人間判断、外部依存、credential、設計未決定で止めている |

1 Issue 1 PR を守り、複数 Issue の差分を混ぜません。

---

## Ready Queue Rules

Codex-ready と判断する条件:

- `status: todo`
- `size: S` または `M`
- 受け入れ条件と検証手順が書かれている
- `blocked_by` が空、または依存が `done` / README に waiver 明記済み
- 未解決の人間判断、credential、deployment、design choice がない
- API 影響がある場合は `docs/openapi/openapi.yaml` から始められる

並行実行ルール:

- 同時に進める Issue は最大 3 本まで
- メイン Codex は Issue Captain として統合責任を持つ
- サブエージェントは原則 read-only review。編集を任せる場合は disjoint write scope に限定する
- privacy / auth / image / AI / DB migration / release / destructive operation は人間確認で止める

---

## Codex Ready Queue

| rank | issue       | priority | size | area          | readiness                                                                 | checks                           |
| ---- | ----------- | -------- | ---- | ------------- | ------------------------------------------------------------------------- | -------------------------------- |
| 1    | `ISSUE-020` | P1       | S    | perf / UX     | loading と prefetch の低リスク改善。OpenAPI 影響なし                      | `pnpm pr:gate`                   |
| 2    | `ISSUE-021` | P1       | S    | perf / bundle | bundle analyzer と font weight の改善。dependency 追加と visual QA は注意 | `pnpm pr:gate`, bundle report    |
| 3    | `ISSUE-023` | P1       | M    | data fetching | TanStack Query 導入。後続 `ISSUE-029` の前提                              | `pnpm pr:gate`                   |
| 4    | `ISSUE-022` | P2       | S    | ai / perf     | 実装着手は可能。AI / image privacy gate は PR review 前に必ず確認         | `pnpm pr:gate`, AI privacy check |

---

## GitHub Intake Queue

以下は GitHub Issue 作成済みだが、ローカル正本 `docs/issues/ISSUE-<number>[suffix]-*.md` はまだ main に存在しない。Codex が着手する前に、各 Issue のローカルコピーを追加する。

| issue       | github | area              | next action                                       |
| ----------- | ------ | ----------------- | ------------------------------------------------- |
| `ISSUE-036` | `#60`  | security          | `docs/issues/ISSUE-036-*.md` を追加して整理開始   |
| `ISSUE-037` | `#57`  | openapi / tooling | `docs/issues/ISSUE-037-*.md` を追加して実装計画化 |

---

## Blocked Or Needs Human Decision

| issue       | blocker                                  | unblock condition                       |
| ----------- | ---------------------------------------- | --------------------------------------- |
| `ISSUE-028` | ADR 番号が `ADR-0011` と衝突している     | `ADR-0013` などに採番を修正してから着手 |
| `ISSUE-029` | `ISSUE-023` の TanStack Query 導入が前提 | `ISSUE-023` が `done` になる            |

---

## Review Queue

| issue       | reason to review / close                                                         |
| ----------- | -------------------------------------------------------------------------------- |
| `ISSUE-001` | 初期設定の review 滞留。現状確認後に `done` 化候補                               |
| `ISSUE-002` | OpenAPI foundation の review 滞留。現 OpenAPI と CI の確認が必要                 |
| `ISSUE-003` | type generation pipeline の review 滞留。生成差分検知が動いているか確認          |
| `ISSUE-004` | API client foundation の review 滞留。現行 client と ProblemDetails 処理を確認   |
| `ISSUE-005` | Supabase + Prisma foundation の review 滞留。DB 接続・migration 方針の確認が必要 |
| `ISSUE-033` | Codex 自動開発 Runbook の review 待ち                                            |
| `ISSUE-034` | PR gate CI の review 待ち                                                        |
| `ISSUE-035` | Issue index / ready queue の review 待ち                                         |
| `ISSUE-032` | MVP release readiness の review 待ち                                             |

---

## Done Archive

- foundation: `ISSUE-006`, `ISSUE-006b`, `ISSUE-006c`, `ISSUE-007`, `ISSUE-008`, `ISSUE-009`, `ISSUE-010`
- product UI: `ISSUE-012`, `ISSUE-013`, `ISSUE-014`, `ISSUE-014a`, `ISSUE-015`, `ISSUE-030`
- perf completed: `ISSUE-016`, `ISSUE-017`, `ISSUE-018`, `ISSUE-019`, `ISSUE-024`, `ISSUE-025`, `ISSUE-026`, `ISSUE-027`, `ISSUE-031`

---

## Maintenance Notes

- Issue の frontmatter status を変更したら、この README の queue / blocker / review queue を更新する。
- ready 判定は `ready: true` のような別フラグで持たない。frontmatter と受け入れ条件から派生させる。
- 自動生成 script はまだ作らない。README の drift が実際に問題になってから `docs/issues/index` 生成を検討する。
- Issue index に実データ、画像 URL、storage_key、AI 生成本文を載せない。
