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
| `github_issue`          | no       | number                                                 | 対応する GitHub Issue 番号                           |
| `parent`                | no       | Issue ID / initiative key                              | 親 Issue または横断テーマ                            |
| `release_gate`          | no       | `mvp_core` / `mvp_quality`                             | release readiness との関係                           |
| `blocked_by`            | no       | issue list                                             | 完了または人間 waiver が必要な Issue 依存            |
| `external_blockers`     | no       | blocker list                                           | credential / QA データ / 人間操作などの外部 blocker  |
| `requires_human_review` | no       | topic list                                             | privacy / security / release など人間確認の種類      |

`ready_for_codex` は新規自動化 Issue に残してよいが、ready queue の正本にはしません。実際の ready 判定は下のルールから派生させます。

---

## Status Snapshot

2026-07-23 時点:

| status        | count | notes                                                                                          |
| ------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `todo`        | 0     | ready queue は空                                                                               |
| `in_progress` | 0     | 並行実行枠は空き                                                                               |
| `review`      | 6     | `ISSUE-046`, `ISSUE-047`, `ISSUE-048`, `ISSUE-049`, `ISSUE-050`, `ISSUE-051` の PR review 待ち |
| `done`        | 46    | archive を参照                                                                                 |
| `blocked`     | 1     | 認証済み実データ QA                                                                            |

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
merge 済み Issue の状態同期だけを目的にした maintenance Issue は、対応 PR の merge によって
完了するため、その PR 内で `done` として archive に入れてよい。

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

現在はありません。

---

## GitHub Intake Queue

以下は GitHub Issue 作成済みだが、ローカル正本 `docs/issues/ISSUE-<number>[suffix]-*.md` はまだ main に存在しない。Codex が着手する前に、各 Issue のローカルコピーを追加する。

現在はありません。

---

## Blocked Or Needs Human Decision

| issue       | blocker                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `ISSUE-041` | 認証済みブラウザセッション、または QA 用ログイン手段と、viewport 外 lazy 判定に足りる画像付き QA データ |

---

## Review Queue

| issue       | reason to review / close                          |
| ----------- | ------------------------------------------------- |
| `ISSUE-046` | accessibility token と viewport remediation の PR |
| `ISSUE-047` | dialog accessibility foundation の PR             |
| `ISSUE-048` | AI consent privacy evidence alignment の PR       |
| `ISSUE-049` | delete restore trust contract の PR               |
| `ISSUE-050` | memory photo alt privacy policy の PR             |
| `ISSUE-051` | album full-list pagination QA の PR               |

---

## Done Archive

- foundation: `ISSUE-001`, `ISSUE-002`, `ISSUE-003`, `ISSUE-004`, `ISSUE-005`, `ISSUE-006`, `ISSUE-006b`, `ISSUE-006c`, `ISSUE-007`, `ISSUE-008`, `ISSUE-009`, `ISSUE-010`
- product UI: `ISSUE-012`, `ISSUE-013`, `ISSUE-014`, `ISSUE-014a`, `ISSUE-015`, `ISSUE-030`
- perf completed: `ISSUE-016`, `ISSUE-017`, `ISSUE-018`, `ISSUE-019`, `ISSUE-020`, `ISSUE-021`, `ISSUE-022`, `ISSUE-023`, `ISSUE-024`, `ISSUE-025`, `ISSUE-026`, `ISSUE-027`, `ISSUE-028`, `ISSUE-029`, `ISSUE-031`, `ISSUE-040`
- qa tooling completed: `ISSUE-038`
- release/process completed: `ISSUE-032`, `ISSUE-033`, `ISSUE-034`, `ISSUE-035`, `ISSUE-036`, `ISSUE-037`
- design process completed: `ISSUE-043`, `ISSUE-044`, `ISSUE-045`
- maintenance completed: `ISSUE-039`, `ISSUE-042`

---

## Maintenance Notes

- Issue の frontmatter status を変更したら、この README の queue / blocker / review queue を更新する。
- ready 判定は `ready: true` のような別フラグで持たない。frontmatter と受け入れ条件から派生させる。
- 自動生成 script はまだ作らない。README の drift が実際に問題になってから `docs/issues/index` 生成を検討する。
- Issue index に実データ、画像 URL、storage_key、AI 生成本文を載せない。
