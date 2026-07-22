---
id: ISSUE-039
title: Issue Index に merge 済み ISSUE-038 を反映
priority: P2
status: done
size: S
created_at: 2026-07-23
github_issue: 83
---

## 目的 (Why)

PR #81 merge 後、ローカル Issue Index が ISSUE-038 を review のまま扱っている。GitHub Issue #80 closed / PR #81 merged の状態に合わせて、ローカル正本を整理する。

## スコープ (What)

- `docs/issues/ISSUE-038-authenticated-image-qa-cdp.md` の status を `done` に更新する
- `docs/issues/README.md` の Status Snapshot / Review Queue / Done Archive を更新する
- この maintenance Issue 自体も、merge 後に完了状態となるよう local copy を残す

## やらないこと

- ISSUE-028 / GitHub Issue #43 は close しない
- 認証済みブラウザ QA / Lighthouse / LCP 再計測は行わない
- OpenAPI / 実装コード / 生成型は変更しない

## 影響範囲

| 領域         | 影響                                |
| ------------ | ----------------------------------- |
| OpenAPI      | なし                                |
| 生成型       | なし                                |
| 画面         | なし                                |
| ドキュメント | `docs/issues/` の状態管理のみ       |
| セキュリティ | 実データ・URL・storage_key は不使用 |

## 受け入れ条件

- [x] ISSUE-038 が review queue から外れて done archive に入っている
- [x] ISSUE-038 の frontmatter status が `done` になっている
- [x] ISSUE-039 の local copy が存在する
- [x] Status Snapshot の count が更新されている
- [x] format / diff check が通る

## 参考

- GitHub Issue #83
- GitHub Issue #80
- PR #81
