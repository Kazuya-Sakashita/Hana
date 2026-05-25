---
id: ISSUE-015
title: /album にサムネイル表示
priority: P1
status: review
size: S
created_at: 2026-05-25
merged_at: null
pr: null
---

## 目的 (Why)

`/album` が ISSUE-009 以来テキストのみのリストで、「写真アプリ感」が無かった。
各記録カードに左側 80px square のサムネイルを追加し、視覚的に「アルバム」感を出す。

PRD §1「子どもとの今日が、10年後の宝物になる。」の「宝物の一覧」体験は、写真が並ぶことで初めて成立する。

---

## スコープ (What)

### 修正

- [ ] `src/app/album/page.tsx`:
  - 2 段階フェッチ:
    - Stage 1: `GET /v1/memories` で text を即時表示
    - Stage 2: 各 memory の `image_ids[0]` に対し `GET /uploads/{id}/url` を並列取得
  - 左 80px square サムネイル (`aspect-square h-20 w-20 rounded-xl`)
  - `Thumbnail` コンポーネント: 3 状態 (string URL / undefined skeleton / null placeholder)
  - 画像取得中: `bg-warm animate-pulse` skeleton
  - 画像無し / 失敗時: ❀ glyph + warm 背景 (V0 §1「empty states are emotional」)

### やらないこと

- V0 §5.4 完全版 (2-col masonry grid + 月セクション sticky) → 別 ISSUE (polish 後追い)
- `cover_image_url` を /v1/memories のレスポンスに含める (API 拡張不要)
- batch endpoint `POST /v1/uploads/urls` (将来の最適化)
- localStorage で URL キャッシュ (Supabase signed URL は 30 分 TTL、毎回 fetch でも実害ない)
- お気に入りや日付絞り込み

---

## 設計判断

### 既存縦リスト + 左サムネイル (V0 §5.4 完全版ではなく)

**採用**: 既存レイアウトを尊重し、サムネイルを差し込むだけ。

- 1〜2 時間で実装、即効性高い
- V0 §5.4 完全版 (月セクション sticky + masonry grid) は別 ISSUE で

**代替案 (却下)**:

- 2-col masonry grid: 月セクション + 4:5/1:1 rhythm が必要、M+ サイズ
- メモリ詳細を tap で「楽器のような」transition: 別 ISSUE で polish

### クライアント側並列 fetch (API 変更なし)

**採用**: `useEffect` で `Promise.all(memories.map(m => GET /uploads/{m.image_ids[0]}/url))`

- 20 memory なら ~200ms で完了 (Supabase signed URL 生成は 10-20ms each)
- API スキーマ無変更
- 2 段階レンダー: text が先に出てから画像が後追いで埋まる = 体感速度良好

**代替案 (却下)**:

- `cover_image_url` を Memory schema に追加: API 変更が必要、ISSUE-009 の OpenAPI スキーマを書き換える
- batch endpoint `POST /v1/uploads/urls`: 新エンドポイント、過剰最適化

### 3 状態の `Thumbnail` 表現

- `string`: 画像表示
- `undefined`: フェッチ中 (skeleton)
- `null`: 画像無し or 失敗 (❀ placeholder)

`undefined` と `null` を意図的に区別: skeleton で永遠にぐるぐる回らないように。

### 失敗時は silent + ❀ placeholder (エラー表示しない)

V0 prompt §4「責めないデザイン」に従う。fetch が失敗しても amber エラーを出さず、品よく ❀ で誤魔化す。
ユーザーが詳細画面を開いたら同じ画像取得ロジックが再走するので、そこで失敗が露呈する。

---

## 影響範囲

| 領域         | 影響                                                |
| ------------ | --------------------------------------------------- |
| OpenAPI      | なし                                                |
| 生成型       | なし                                                |
| データ       | なし                                                |
| 画面         | `/album` のレイアウトのみ変更 (Link 構造は保持)     |
| サーバ       | なし                                                |
| CI           | typecheck / lint / format / build / test 全グリーン |
| ドキュメント | このIssueファイル                                   |
| 環境変数     | なし                                                |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 220 件パス (UI のみの変更なのでテスト追加は無し)
- [ ] `/album` で各記録に **80px square サムネイル** が左に表示
- [ ] 取得中は warm pulse skeleton
- [ ] 画像無し / fetch 失敗 → ❀ placeholder
- [ ] テキストとサムネイルが横並びでバランス良く配置
- [ ] お気に入り ❀ glyph は meta strip に維持
- [ ] サムネイル/テキスト全体をタップで `/memory/{id}` 遷移 (ISSUE-013 機能維持)

---

## セキュリティ・プライバシー考慮

- [ ] **signed URL のログ禁止** (ADR-0009 §5 継続)
- [ ] **画像 URL は memo 表示のみ**、永続化・他人への共有しない
- [ ] **クライアントで URL を表示するだけ**、サーバ側は変更なし

---

## 動作確認手順

```bash
pnpm dev
# /sign-in → /album を開く
# 1. テキスト一覧が即時表示される
# 2. 数百ミリ秒で左 80px サムネイルが pulse skeleton → 画像に変わる
# 3. サムネイルもテキストもタップで /memory/{id} へ
# 4. 画像が無い / 取得失敗の memory は ❀ placeholder
```

---

## 参考

- ISSUE-009 (Memory) — GET /v1/memories と GET /v1/uploads/{id}/url の元実装
- ISSUE-013 (Memory detail) — /memory/[id] への遷移先
- `Hana_PRD_v1.md` §1
- `docs/design/v0-prompt.md` §5.4 (タイムライン、完全版は別 ISSUE)
- V0 prompt §1 / §4 (empty states are emotional, never red)
