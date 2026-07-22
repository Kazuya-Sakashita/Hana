---
id: ISSUE-040
title: アルバム一覧が新規保存後に1件だけになる問題を修正
priority: P1
status: review
size: S
created_at: 2026-07-23
github_issue: 85
---

## 目的 (Why)

`/record` から新規記録を保存した後、`/album` の一覧が最近の 1 件だけに見える問題を修正する。

## 仮説

`optimisticAddMemoryToLists` が、未訪問の album list cache を新規 1 件だけで作っている。その直後に `/album` へ遷移すると、Server Component が複数件の `initialData` を渡しても TanStack Query は既存 cache を優先するため、5 分間 1 件だけに見える可能性が高い。

## スコープ (What)

- 未訪問の album list cache を新規 1 件だけで作らない
- 既存 album list cache がある場合の楽観追加は維持する
- 未訪問 album では、古い SSR 一覧を一瞬見せないよう保存完了後に `/album` へ遷移する
- regression test を追加・更新する
- `/v1/memories` が複数 memory を collapse せず返すことを確認する

## やらないこと

- OpenAPI / 生成型 / DB schema の変更
- 実データや signed URL を使ったブラウザ QA
- ISSUE-028 / GitHub Issue #43 の close

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| DB           | なし                                     |
| 画面         | `/record` 保存直後の `/album` 一覧 cache |
| テスト       | optimistic memory list helper の unit    |
| ドキュメント | local Issue copy                         |

## 受け入れ条件

- [x] 未訪問の album list cache を新規 1 件だけで作らない
- [x] 既存 album list cache がある場合は楽観追加される
- [x] 未訪問 album では保存完了後に `/album` へ遷移する
- [x] regression test が追加・更新されている
- [x] `pnpm test tests/unit/lib/perf/optimistic.test.ts` が通る
- [x] `pnpm test tests/integration/v1/memories.test.ts` が通る
- [x] `pnpm pr:gate` が通る

## 調査結果

- 再現 loop: `pnpm test tests/unit/lib/perf/optimistic.test.ts`
- 現行実装では、未訪問の `memoryListQueryKey(50)` に新規 1 件だけの cache が作られ、 regression test が赤になった
- 修正後は未訪問 list cache を作らず、既存 list cache に対する楽観追加だけを維持する
- 未訪問 album では、保存完了前の古い Server Component 一覧を見せないため、POST 完了後に `/album` へ遷移する
- `/v1/memories` は複数 memory fixture を collapse せず返すことを integration test で確認
- `pnpm pr:gate` で format / lint / OpenAPI route-map / typecheck / tests / build:ci が成功

## 参考

- GitHub Issue #85
- `src/app/record/page.tsx`
- `src/lib/perf/optimistic.ts`
- `tests/unit/lib/perf/optimistic.test.ts`
