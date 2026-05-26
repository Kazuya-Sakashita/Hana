---
id: ISSUE-023
title: Tanstack Query 導入 + /me /children のグローバルキャッシュ
priority: P1
status: todo
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

現状、 **`/me` と `/children` は 4 ページ (`/`, `/record`, `/onboarding`, `/settings`) から個別に useEffect で fetch** されている。
画面遷移するたびに **同じデータを取り直し**、 ブラウザの HTTP cache 任せ。

`@tanstack/react-query` を導入して、 全画面で:
- 同じ API は in-memory で 1 度だけ fetch
- `staleTime` で TTL 制御
- mutation 後の自動 invalidate
- 将来の Server Component 化 (ISSUE-025〜027) と整合する設計

を実現する。

---

## スコープ (What)

### 新規

- [ ] `@tanstack/react-query` を dependencies に追加
- [ ] `src/lib/query/client.tsx` を新設
  - `QueryClientProvider` を提供する `<Providers>` Client Component
  - `defaultOptions.queries.staleTime: 5 * 60 * 1000` (5min)
  - `defaultOptions.queries.retry: 1` (失敗は控えめに)
- [ ] `src/app/layout.tsx` の `<body>` 内を `<Providers>` でラップ
- [ ] `src/features/me/client/use-current-user.ts`
  - `useQuery({ queryKey: ['me'], ... })`
- [ ] `src/features/children/client/use-children.ts`
  - `useQuery({ queryKey: ['children'], ... })`
- [ ] `src/features/memories/client/use-memories.ts`
  - `useQuery({ queryKey: ['memories', { limit }], ... })`

### 修正 (段階移行)

- [ ] `/` `/record` `/onboarding` `/settings` を順に hook 経由に置換
  - 各ページの `useEffect + fetch + phase 状態` を `const { data, isLoading, error } = useQuery(...)` に
- [ ] mutation 系 (`POST /memories`, `POST /children`, `POST /me/ai-consent`) を `useMutation` に
  - 成功時 `queryClient.invalidateQueries({ queryKey: ['memories'] })` などで自動 refetch

### やらないこと

- Server Component 化 (ISSUE-025〜027)
- `/album` `/memory/[id]` の hook 置換 → Server Component 化と同時に行う方が効率
- DevTools 導入 (任意、`@tanstack/react-query-devtools`)

---

## 設計判断

### Tanstack Query を選んだ理由

- SWR より mutation / cache invalidation の表現力が高い
- Suspense 連携が公式サポート → ISSUE-025 で活用予定
- 将来 Server Component 化しても `dehydrate` / `hydrate` で server → client 引き継ぎ可

### staleTime = 5 分の根拠

- `/me` `/children` は実質ほぼ静的 (display_name 変更程度)
- 5 分以内の操作では fetch しない
- 5 分超で次のアクセス時にバックグラウンド refetch (stale-while-revalidate)

### `/album` `/memory/[id]` を本Issueで触らない理由

ISSUE-018 で `cover_thumbnail_url` を BFF 化済み、 ISSUE-025〜027 で Server Component 化する予定。
ここで中途半端に client query 化すると二度手間。

---

## 影響範囲

| 領域         | 影響                                              |
| ------------ | ------------------------------------------------- |
| OpenAPI      | なし                                              |
| 生成型       | なし                                              |
| データ       | なし                                              |
| 画面         | `/`, `/record`, `/onboarding`, `/settings` のフェッチ層 |
| API          | なし                                              |
| テスト       | 既存テスト + hook の unit test                    |
| CI           | typecheck / lint / format / build / test          |
| ドキュメント | このIssueファイル                                |
| 環境変数     | なし                                              |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] `/` → `/settings` 遷移時に `/me` `/children` が **再 fetch されない** (DevTools Network 確認)
- [ ] `/record` で POST 成功後、 次に `/album` (将来) で memory list が refetch される (invalidate)
- [ ] 各 hook の error / loading が UI に正しく反映
- [ ] BottomNav は影響を受けない

---

## 動作確認手順

```bash
pnpm dev
# 1. / にアクセス → /me /children fetch
# 2. /settings へ遷移 → /me /children は呼ばれない (cache hit)
# 3. /record で memory を作成 → 完了後 / に戻ると memories が新鮮
# 4. 5 分待ってから再アクセス → background refetch を確認
# 5. ネット切断時の error 表示を確認
```

---

## リスク

- 既存 phase 状態管理との並走バグ → 段階移行 (1 画面ずつ PR を分けるなら別 Issue 化を検討)
- bundle size +20KB 程度 → ISSUE-021 で監視
- SSR 連携を後から入れる時に key 設計を変更する可能性 → key は `['resource', params]` の anti-pattern を避けて整理

---

## 参考

- ISSUE-018 (BFF cover、本Issueと整合)
- ISSUE-025〜027 (Server Component 化、本Issueの後)
- Tanstack Query: https://tanstack.com/query/latest
