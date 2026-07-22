# ISSUE-028 ブラウザ QA 試行 (2026-07-23)

## 対象

- GitHub Issue: #43
- 関連 Issue: `docs/issues/ISSUE-028-perf-next-image.md`
- 前回 QA 記録: `docs/perf/issue-028-post-merge-qa-2026-07-22.md`
- 作業 branch: `codex/issue-043-browser-qa`
- worktree: `/private/tmp/hana-issue43-browser-qa`
- 開始 base: `origin/main` / `73fe443` (PR #79 merge 後)

この記録は、#43 の未完受け入れ条件である認証済みブラウザ QA を進めるため、
2026-07-23 に実データ環境へ接続できるかを確認した結果である。

## 目的

#43 では、静的確認と integration test だけでは完了扱いにできない以下を残している。

- DevTools Network で `/album` の画像 request が `*_thumb.webp` signed URL であることを確認する
- DevTools Network で `/memory/{id}` の画像 request が `*_preview.webp` signed URL であることを確認する
- `/album` の viewport 外画像が初期ロードに含まれないことを確認する
- Lighthouse mobile で "Properly size images" が悪化していないことを確認する
- `/memory/{id}` の LCP を 2026-05-27 baseline と比較して再計測する

## 実施したこと

| 確認項目                                                       | 結果     | 備考                                         |
| -------------------------------------------------------------- | -------- | -------------------------------------------- |
| `origin/main` から別 worktree / branch を作成                  | 完了     | メイン worktree には触れない                 |
| `pnpm install --frozen-lockfile`                               | 完了     | lockfile 変更なし                            |
| メイン worktree の `.env.local` に必要キーがあることを確認     | 完了     | 値は出力しない                               |
| `DATABASE_URL` を使った読み取り専用 DB 接続確認                | 接続不可 | Supabase pooler の tenant/user 不一致で失敗  |
| `DIRECT_URL` を使った読み取り専用 DB 接続確認                  | 接続不可 | 同上                                         |
| 認証済みブラウザで `/album` / `/memory/{id}` の Network を確認 | 未実施   | 有効な実データ DB 接続が必要                 |
| Lighthouse mobile / LCP 再計測                                 | 未実施   | 認証済みページと実データ memory/image が必要 |

## 結論

2026-07-23 時点では、ローカルの `.env.local` に必要キーは存在するが、DB 接続情報が
現在の Supabase 環境と一致していないため、実データを使った認証済みブラウザ QA は実施できなかった。

このため、#43 の未完受け入れ条件はまだ満たしていない。Issue #43 は close しない。

## 次に必要なもの

以下が揃えば、#43 の残 QA を再開できる。

- 現在有効な Supabase `DATABASE_URL` または `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 認証済みブラウザセッション、または QA 用ログイン手段
- 画像付き memory が 1 件以上ある QA データ

確認時は PII / storage key / signed URL の token を PR や Issue に貼らず、以下のように要約だけを記録する。

- `/album`: 画像 request の末尾が `_thumb.webp` であること
- `/memory/{id}`: 画像 request の末尾が `_preview.webp` であること
- 初期ロード時の画像 request 件数
- Lighthouse mobile の `Performance`, `LCP`, `CLS`, `Properly size images` の結果
- 2026-05-27 baseline との LCP 比較
