---
id: ISSUE-027
title: /memory/[memoryId] を Server Component 化 (初期データを SSR)
priority: P2
status: review
size: M
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

ISSUE-025 / 026 と同じ思想で、 記録詳細画面 (`/memory/[memoryId]`) を Server Component 化する。
詳細画面は **「アルバムからクリックして開く」 動線が主** で、 prefetch + SC で「ほぼ瞬時に表示」 を目指す。

---

## スコープ (What)

### 修正

- [ ] `src/app/memory/[memoryId]/page.tsx` を **Server Component** に
  - server で `memory + child + 画像 preview URL 全件` を並列取得
  - 画像 URL は ISSUE-019 の `?size=preview` (1024px) を使用
  - 認可チェック (`memory.userId !== user.id` → 404 or 403)
- [ ] 削除確認ダイアログ / 編集ボタン / お気に入りトグルなどは Client Component に切り出し
- [ ] `notFound()` で 404 ページ表示 (該当 memory が無い / 他人のもの)
- [ ] `generateMetadata()` で `<title>` を動的化 (例: `タイトル | Hana`)

### Suspense

- [ ] 本画像を Suspense でラップ (Storage URL 生成中の skeleton)
- [ ] テキスト (タイトル / 本文 / メタ) は同期表示

### やらないこと

- 画像 zoom (将来 Issue)
- 編集機能の追加
- 共有機能

---

## 設計判断

### `notFound()` を使う理由

404 を返すことで:

- next.js が `not-found.tsx` を出す (用意があれば)
- 認可違反でも「存在しない」 と表現できる (情報漏洩しない)
- "うまく ひらけませんでした" 画面より UX が一貫

### `generateMetadata()` で title を動的化

OGP 用ではなく **ブラウザタブ用**。 「家族とわかちあう」 機能 (将来) で sharing のときも一貫した title になる。

ただし title に **「タイトル + 子ども名」 を入れない** (タブが見られたとき)。 「Hana - 記録」 程度に。
→ V0 §1 「Whisper not shout」 に沿う、 PII を出さない。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/memory/[memoryId]` 全体                |
| API          | なし                                     |
| テスト       | 既存 + SC 用                             |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] `/memory/{id}` の HTML に title / body / meta が含まれている (View Source)
- [ ] LCP が baseline -50% 以上 (画像 fetch は依然必要)
- [ ] 他ユーザーの memory に直接 URL アクセス → 404
- [ ] 削除 / お気に入り操作が引き続き動く
- [ ] ブラウザタブのタイトルが `Hana` ベースで設定 (PII なし)

---

## 動作確認手順

```bash
pnpm dev
# 1. /album → /memory/{id} 遷移 (prefetch + SC で瞬時)
# 2. View Source で本文 / メタが HTML に含まれること
# 3. 他ユーザーの memory ID で直接アクセス → 404
# 4. 削除 → /album に戻る
# 5. お気に入りトグル → 即時反映 (Tanstack Query mutation)
```

---

## リスク

- 画像 fetch が SC 内で blocking すると逆効果 → Suspense 境界を画像だけに限定
- prefetch の HTML サイズが大きくなる (本文を含むため) → 1 KB 以下なので問題なし

---

## 参考

- ISSUE-013 (memory detail 元実装)
- ISSUE-017 / 018 / 019 / 023 (前提)
- ISSUE-025 (album SC、 構造パターン参考)
