---
title: アルバムと記録詳細 Keepsake QA 契約
last_updated: 2026-07-23
owner: kazuya
requires_human_review:
  - accessibility
  - design
  - privacy
---

# アルバムと記録詳細 Keepsake QA 契約

ISSUE-057 では、アルバム一覧と記録詳細を public feed ではなく、私的な保存棚として扱う。
API、pagination、削除 restore promise は変更しない。

## 現在の契約

| topic         | contract                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Album list    | `paper-surface` と `photo-mat` を使い、memory item は投稿カードではなく保存された紙片にする。    |
| Load more     | `next_cursor` と `useInfiniteMemoriesQuery` を維持し、既存の追加入力と status focus を壊さない。 |
| Favorite      | ranking ではなく個人的なしるしとして扱い、optimistic update と rollback を維持する。             |
| Detail        | 写真と物語本文を主役にし、metadata と actions は控えめに置く。                                   |
| Delete trust  | active UI で restore や保持期間を約束しない。                                                    |
| Accessibility | 44px tap target、visible focus、decorative thumbnail alt、detail photo alt を維持する。          |

## Synthetic QA 状態

- 0 memories: empty album は初回記録へ静かにつなぐ。
- 1 to 49 memories: load more は出ない。
- 51 or more memories: load more が表示され、追加後の status が focus 可能。
- Favorite success / failure: しるしの optimistic update と rollback が残る。
- Detail with photo and body: 写真、title、body、metadata、actions の順序が保たれる。
- Detail with multiple photos: first photo is the hero, additional photos are a small strip after the story.
- Long title/body on 390px: user text wraps with `overflow-wrap:anywhere` and does not push outside the viewport.
- Detail delete dialog: `deleteMemoryDescription` を使い、restore promise を出さない。

## Synthetic QA 結果

2026-07-23 時点では、ISSUE-057 の実アプリ screenshot は認証済みデータと signed preview URL が必要なため保存しない。
mobile density は source-level contract と `pnpm pr:gate` で確認し、実ブラウザ screenshot gate は `ISSUE-059` で synthetic / redacted data のみを使って行う。

## 証跡ルール

- 実写真、実名、実タイトル、実本文、画像 URL、storage_key 実値、prompt、AI 生成本文を QA 証跡に残さない。
- Screenshot が必要な場合は synthetic data のみを使う。
- Child name、initial、avatar / link `aria-label`、memory body、`previewUrl`、signed image URL、`storage_key`、prompt、AI 生成本文は PR 証跡に残さない。
- DOM snapshot、network HAR、Playwright trace は原則として PR 証跡にしない。必要な場合は synthetic data を使うか、上記すべてを redaction 済みにする。
