---
name: Feature / Task
about: 新機能・改善・リファクタリングの Issue
title: '[ISSUE-XXX] '
labels: ['type:feature']
assignees: []
---

<!--
docs/issues/ISSUE-XXX-<slug>.md にも同じ内容を保存してください。
（永続化のため。GitHub Issues が消えても文脈が残る）
-->

## 目的 (Why)

<このIssueを完了すると、ユーザーまたは開発者にとって何が良くなるか>

## スコープ (What)

- [ ] <やること1>
- [ ] <やること2>

## やらないこと (Out of Scope)

- <意図的に除外する範囲>

## 影響範囲

| 領域    | 影響                                      |
| ------- | ----------------------------------------- |
| OpenAPI | <更新するpaths/schemas、なしなら「なし」> |
| 生成型  | <影響するファイル>                        |
| 画面    | <影響する画面/feature>                    |
| データ  | <DBスキーマ変更の有無>                    |
| CI      | <変更点>                                  |

## 受け入れ条件 (Acceptance Criteria)

- [ ] OpenAPI が `pnpm openapi:lint` を通る
- [ ] 生成型を更新済み（PR 差分に含む）
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る
- [ ] 単体・契約テストを追加
- [ ] 動作確認: <具体的な操作>
- [ ] ログに個人情報が出ていないことを確認

## セキュリティ・プライバシー考慮 (必須)

- [ ] 認可チェック追加？
- [ ] 画像のアクセス制御？
- [ ] AI に送るデータの最小化？
- [ ] ログマスキング？

## 優先度・サイズ

- priority: P0 | P1 | P2
- size: S (半日以内) | M (1-2日) | L (3日以上 → 分割検討)

## 参考

- PRD: `Hana_PRD_v1.md` §<n>
- ADR: `docs/adr/NNNN-*.md`
- 既存 Issue: ISSUE-XXX
