---
id: ISSUE-025
title: /album を Server Component 化 (初期データを SSR)
priority: P1
status: done
size: M
created_at: 2026-05-26
merged_at: 2026-06-11
pr: 54
parent: PERF
---

## 目的 (Why)

`/album` は現在 100% Client Component で、 HTML が空の状態でロード → mount 後に fetch → 表示の waterfall になっている。
**Server Component で初期 50 件をすでに HTML に含めて返す** ことで、 LCP を大幅に短縮する。

ISSUE-018 (cover URL を BFF) と ISSUE-023 (Tanstack Query) が完了している前提。

---

## スコープ (What)

### 修正

- [ ] `src/app/album/page.tsx` を **Server Component** に変更 (`'use client'` 削除)
  - server で `prisma.memory.findMany` を直接実行 (もしくは internal API client で `GET /v1/memories?limit=50` を呼ぶ)
  - cover URL も server で生成 (ISSUE-018 の内部関数を再利用)
  - 取得結果を直接 HTML にレンダリング (Suspense は外側、 list 部分は同期)
- [ ] インタラクティブ部分は子の Client Component に切り出し
  - `<AlbumListItem>` (お気に入りトグルがある場合) など
- [ ] エラー時の表示は `error.tsx` を用意
- [ ] `loading.tsx` は ISSUE-020 のものを継続利用

### 認証

- [ ] Server Component から `requireUser()` (ISSUE-017 で cache 化済) を直接呼ぶ
- [ ] 未認証なら server 側で `redirect('/sign-in')`

### Tanstack Query 連携

- [ ] `dehydrate(queryClient)` で server state を `HydrationBoundary` 経由で client に渡す
- [ ] client 側で削除 / 並び替えなどの mutation 後は invalidate で refetch

### やらないこと

- `/` `/memory/[id]` の Server Component 化 (それぞれ ISSUE-026 / 027)
- album 内のフィルタ機能の追加
- cursor pagination の UI 改善

---

## 設計判断

### prisma 直叩き vs internal API call

Server Component 内では **prisma 直叩き** を採用:

- HTTP 往復が不要 (server 同士の通信オーバーヘッドゼロ)
- 認可ロジックは `requireUser()` + `where: { userId }` で担保
- ただし共通ロジックは `src/features/memories/server/queries.ts` に切り出して Route Handler と共有

### Suspense 境界の置き方

```
<Shell>
  <Header /> (同期)
  <Suspense fallback={<AlbumSkeleton />}>
    <AlbumList /> (async server component)
  </Suspense>
</Shell>
```

これで Header は即表示、 list は stream で。

### Tanstack Query との整合

mutation 後のリアルタイム反映が必要な操作 (削除、お気に入り) は、 client で query を持ち、 server の初期データを `HydrationBoundary` で渡す。
読み取り専用の場合は SC のみで完結。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/album` 全体                            |
| API          | なし (server から内部呼び出しに切替)     |
| テスト       | 既存 E2E がパス + SC 用 unit test        |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] `/album` の HTML レスポンスに memory list が **含まれている** (View Source で確認)
- [ ] DevTools Throttling Slow 4G で LCP が **ISSUE-016 baseline -50% 以上** 短縮
- [ ] 削除 / お気に入り mutation が引き続き動く
- [ ] 未認証で `/album` にアクセスすると `/sign-in` に redirect
- [ ] BottomNav が引き続き表示・active が正しい

---

## 動作確認手順

```bash
pnpm dev
# 1. /album を開き、View Source で memory list の HTML を確認
# 2. DevTools で Network Throttling Slow 4G、 LCP を計測 → baseline と比較
# 3. お気に入りトグルが動くこと
# 4. /sign-out 後に /album → /sign-in redirect
# 5. /album → /memory/{id} 遷移が依然サクサクであること
```

---

## リスク

- **大**: 既存テスト・動線が想定外に壊れる可能性 → PR を /album のみに限定、 動線テスト必須
- prisma を server component で使うとデータベース connection が増える可能性 → connection pooling 設定を確認
- Suspense 境界が適切でないと全体ブロックされる → fallback の skeleton 形状を baseline と一致

---

## 参考

- ISSUE-017 (requireUser cache、前提)
- ISSUE-018 (cover BFF、前提)
- ISSUE-020 (loading.tsx、 fallback で再利用)
- ISSUE-023 (Tanstack Query、 hydration 連携)
- Next.js Server Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
