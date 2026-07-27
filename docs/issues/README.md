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

2026-07-27 時点:

| status        | count | notes            |
| ------------- | ----- | ---------------- |
| `todo`        | 0     | なし             |
| `in_progress` | 0     | 並行実行枠は空き |
| `review`      | 0     | なし             |
| `done`        | 104   | archive を参照   |
| `blocked`     | 0     | なし             |

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

## In Progress

現在はありません。

## Planned Design Rebuild Sequence

| order | issue       | title                                  | note |
| ----- | ----------- | -------------------------------------- | ---- |
| 1     | `ISSUE-054` | デザイントークンと共通 UI 刷新         | done |
| 2     | `ISSUE-058` | 状態文言と静かなモーション体系         | done |
| 3     | `ISSUE-055` | 記録画面の下部シート型 30 秒フロー刷新 | done |
| 4     | `ISSUE-056` | ホームの Quiet Heirloom 刷新           | done |
| 5     | `ISSUE-057` | アルバムと記録詳細の keepsake 刷新     | done |
| 6     | `ISSUE-059` | デザインモバイル QA とレビューゲート   | done |

## Planned Product Experience V2 Sequence

| order | issue       | title                                  | note |
| ----- | ----------- | -------------------------------------- | ---- |
| 1     | `ISSUE-060` | 約束整合と共通シェル基盤               | done |
| 2     | `ISSUE-061` | Settings Trust Center v1               | done |
| 3     | `ISSUE-062` | Onboarding to First Memory Bridge      | done |
| 4     | `ISSUE-063` | Record Saved Moment and Memory Landing | done |
| 5     | `ISSUE-064` | Product Design QA v2                   | done |

## Planned Quiet Heirloom Refinement Sequence

| order | issue       | title                                         | note |
| ----- | ----------- | --------------------------------------------- | ---- |
| 1     | `ISSUE-066` | Quiet Heirloom refinement 設計契約            | done |
| 2     | `ISSUE-067` | トークンと共通 UI の質感調整                  | done |
| 3     | `ISSUE-068` | ホーム first view を写真主役へ調整            | done |
| 4     | `ISSUE-069` | 記録画面を 1 判断ずつの下部シート体験へ調整   | done |
| 5     | `ISSUE-070` | アルバムと記録詳細を private shelf 体験へ調整 | done |

## Planned LP Public Readiness Sequence

| order | issue       | GitHub | title                                             | note |
| ----- | ----------- | ------ | ------------------------------------------------- | ---- |
| 1     | `ISSUE-071` | `#162` | LP 静的プロトタイプと専門家評価を公開前課題へ整理 | done |
| 2     | `ISSUE-072` | `#163` | LP の実行可能な CV 導線を決めて接続               | done |
| 3     | `ISSUE-073` | `#164` | LP Before / After の価値証拠を強化                | done |
| 4     | `ISSUE-074` | `#165` | LP Hero を keepsake 主役の構図へ再構成            | done |
| 5     | `ISSUE-075` | `#166` | LP 公開前 QA と trust human review gate           | done |

## Planned LP-App Design Parity Sequence

| order | issue       | GitHub | title                                         | note |
| ----- | ----------- | ------ | --------------------------------------------- | ---- |
| 1     | `ISSUE-076` | `#171` | LP と本体アプリの視覚語彙を接続する           | done |
| 2     | `ISSUE-077` | `#173` | 共通 keepsake primitive と icon language 実装 | done |
| 3     | `ISSUE-078` | `#175` | Record 30秒 one-decision flow alignment       | done |
| 4     | `ISSUE-079` | `#177` | BottomNav と action icon の quiet alignment   | done |
| 5     | `ISSUE-080` | `#179` | Sign-in / Onboarding / Settings trust bridge  | done |
| 6     | `ISSUE-081` | `#181` | Album / Memory Detail private shelf polish    | done |
| 7     | `ISSUE-082` | `#183` | LP-App visual parity QA gate                  | done |

## Planned Public Surface Warmth Sequence

| order | issue       | GitHub | title                                                   | note |
| ----- | ----------- | ------ | ------------------------------------------------------- | ---- |
| 1     | `ISSUE-084` | `#190` | /privacy を Quiet Heirloom trust surface に再設計する   | done |
| 2     | `ISSUE-085` | `#191` | /lp を keepsake journey と public trust bridge へ寄せる | done |
| 3     | `ISSUE-086` | `#192` | Public LP / Privacy visual QA gate を拡張する           | done |

## Planned Prelaunch Validation Sequence

| order | issue       | GitHub | title                                             | note |
| ----- | ----------- | ------ | ------------------------------------------------- | ---- |
| 1     | `ISSUE-089` | `#202` | 待機リスト登録後の連絡期待値を明確にする          | done |
| 2     | `ISSUE-091` | `#206` | 待機リスト公開前 readiness gate を追加する        | done |
| 3     | `ISSUE-093` | `#210` | LP の親 relevance と trust 詳細導線を強化する     | done |
| 4     | `ISSUE-095` | `#214` | LP の表記ゆれと artifact 文言を整える             | done |
| 5     | `ISSUE-097` | `#218` | LP 評価表の relevance と trust 完了状態を同期する | done |
| 6     | `ISSUE-099` | `#222` | LP 公開用 keepsake 画像 asset を追加する          | done |
| 7     | `ISSUE-101` | `#226` | LP の紙片と card 境界を Quiet Heirloom に寄せる   | done |

---

## GitHub Intake Queue

以下は GitHub Issue 作成済みだが、ローカル正本 `docs/issues/ISSUE-<number>[suffix]-*.md` はまだ main に存在しない。Codex が着手する前に、各 Issue のローカルコピーを追加する。

現在はありません。

---

## Blocked Or Needs Human Decision

現在はありません。

---

## Review Queue

現在はありません。

---

## Done Archive

- foundation: `ISSUE-001`, `ISSUE-002`, `ISSUE-003`, `ISSUE-004`, `ISSUE-005`, `ISSUE-006`, `ISSUE-006b`, `ISSUE-006c`, `ISSUE-007`, `ISSUE-008`, `ISSUE-009`, `ISSUE-010`
- product UI: `ISSUE-012`, `ISSUE-013`, `ISSUE-014`, `ISSUE-014a`, `ISSUE-015`, `ISSUE-030`, `ISSUE-087`
- perf completed: `ISSUE-016`, `ISSUE-017`, `ISSUE-018`, `ISSUE-019`, `ISSUE-020`, `ISSUE-021`, `ISSUE-022`, `ISSUE-023`, `ISSUE-024`, `ISSUE-025`, `ISSUE-026`, `ISSUE-027`, `ISSUE-028`, `ISSUE-029`, `ISSUE-031`, `ISSUE-040`, `ISSUE-041`
- qa tooling completed: `ISSUE-038`
- release/process completed: `ISSUE-032`, `ISSUE-033`, `ISSUE-034`, `ISSUE-035`, `ISSUE-036`, `ISSUE-037`
- design process completed: `ISSUE-043`, `ISSUE-044`, `ISSUE-045`, `ISSUE-046`, `ISSUE-047`, `ISSUE-048`, `ISSUE-049`, `ISSUE-050`, `ISSUE-051`, `ISSUE-053`
- maintenance completed: `ISSUE-039`, `ISSUE-042`, `ISSUE-052`, `ISSUE-065`, `ISSUE-088`, `ISSUE-090`, `ISSUE-092`, `ISSUE-094`, `ISSUE-096`, `ISSUE-098`, `ISSUE-100`, `ISSUE-102`
- design rebuild completed: `ISSUE-054`, `ISSUE-058`, `ISSUE-055`, `ISSUE-056`, `ISSUE-057`, `ISSUE-059`
- product experience completed: `ISSUE-060`, `ISSUE-061`, `ISSUE-062`, `ISSUE-063`, `ISSUE-064`
- refinement completed: `ISSUE-066`, `ISSUE-067`, `ISSUE-068`, `ISSUE-069`, `ISSUE-070`
- lp public readiness completed: `ISSUE-071`, `ISSUE-072`, `ISSUE-073`, `ISSUE-074`, `ISSUE-075`, `ISSUE-083`
- lp-app design parity completed: `ISSUE-076`, `ISSUE-077`, `ISSUE-078`, `ISSUE-079`, `ISSUE-080`, `ISSUE-081`, `ISSUE-082`
- public surface warmth completed: `ISSUE-084`, `ISSUE-085`, `ISSUE-086`
- prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`, `ISSUE-095`, `ISSUE-097`, `ISSUE-099`, `ISSUE-101`

---

## Maintenance Notes

- Issue の frontmatter status を変更したら、この README の queue / blocker / review queue を更新する。
- ready 判定は `ready: true` のような別フラグで持たない。frontmatter と受け入れ条件から派生させる。
- 自動生成 script はまだ作らない。README の drift が実際に問題になってから `docs/issues/index` 生成を検討する。
- Issue index に実データ、画像 URL、storage_key、AI 生成本文を載せない。
