---
id: ISSUE-026
title: / (home) を Server Component 化 (初期データを SSR)
priority: P1
status: review
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

ISSUE-025 と同じ思想で、 ホーム画面 (`/`) を Server Component 化する。
ホームは初回着地の頻度が最も高く、 LCP 改善の効果が大きい。

ISSUE-018 (cover URL BFF) と ISSUE-023 (Tanstack Query) 完了後に着手。

---

## スコープ (What)

### 修正

- [ ] `src/app/page.tsx` を **Server Component** に
  - server で並列に `me / child / memories(limit=5)` を取得 (`Promise.all`)
  - cover URL も server で生成
  - 「これまでの あゆみ」 stat (memory count / 月齢 / 経過日数) も server で計算
- [ ] `useSyncExternalStore` での挨拶 (時間帯別) は **Client Component に切り出し**
  - `<Greeting />` だけ `'use client'`、 残りは server
- [ ] hero card の `<Link href="/record">` などは server で OK (Link は Server Component で動く)
- [ ] 子ども未登録時の redirect を server 側で `redirect('/onboarding')`

### Suspense

- [ ] Top bar (挨拶 + アバター) は同期表示
- [ ] Hero card は同期表示 (静的)
- [ ] 「さいきんの ページ」「これまでの あゆみ」を Suspense でラップ

### やらないこと

- 月別ふりかえり (ISSUE-016 月別フィルタ、別件)
- 1年前の今日 (ISSUE-017 push、別件)
- avatar 画像化 (現状イニシャル fallback で OK)

---

## 設計判断

### `<Greeting />` だけ Client にする理由

時間帯別の挨拶はクライアント時刻に依存。 Server Component で固定値 (「こんにちは」) を返し、 Client で hydration 後に切り替える。
これは ISSUE-012 で `useSyncExternalStore` で解決済みのパターンを継承。

### stat の server 計算

memory count / 月齢 / 経過日数は server で計算可。
ただし「経過日数」 は client の現在時刻に依存するため、 server では UTC 日付で計算し、 client で再計算が必要なら hydration mismatch に注意。

→ **シンプルに UTC 日付ベースで server 計算** とし、 日跨ぎは無視 (誤差 ±1 日を許容)。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/` 全体                                 |
| API          | なし (server から内部呼び出し)           |
| テスト       | 既存 + SC 用                             |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] `/` の HTML レスポンスに hero card + 最近 5 件 + stat が **含まれている** (View Source)
- [ ] LCP が **baseline -40% 以上** (ホームは memory 5 件しか fetch しないので -50% は難しいかも)
- [ ] 挨拶が時間帯に応じて切り替わる (hydration mismatch なし)
- [ ] 子ども未登録で `/onboarding` redirect が機能
- [ ] memory 0 件で empty state ❀

---

## 動作確認手順

```bash
pnpm dev
# 1. / を開き、View Source で hero card / 最近のページ / stat が出ていること
# 2. 朝/昼/夜の挨拶を、 system clock を変えて確認 (または環境変数で差し替え)
# 3. memory を削除して 0 件 → empty state
# 4. 子ども情報を削除 → /onboarding redirect
# 5. LCP を baseline と比較
```

---

## リスク

- 挨拶の hydration mismatch (Server: こんにちは / Client: おはよう) → server snapshot を「こんにちは」 固定にして対処済 (ISSUE-012 と同じ手法)
- 経過日数の日跨ぎでズレが体感される → 24:00 跨ぎだけだが、 ±1 日の誤差を許容と明記

---

## 参考

- ISSUE-012 (ホーム画面 V0 §5.2)
- ISSUE-017 (requireUser cache、前提)
- ISSUE-018 (cover BFF、前提)
- ISSUE-025 (album SC、 hydration パターン参考)
