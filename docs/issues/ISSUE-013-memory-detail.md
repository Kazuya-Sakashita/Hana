---
id: ISSUE-013
title: 記録詳細画面 (/memory/[memoryId]) — "the cry-worthy moment"
priority: P0
status: review
size: M
created_at: 2026-05-25
---

## 目的 (Why)

PRD §5「親が後から見返して泣ける理由」と V0 prompt §5.5 の **"cry-worthy moment"** 画面を実装する。
ISSUE-009 で /album にテキストリストは出るようになったが、各記録をタップしても遷移先がなかった。
本Issueで「写真をフルサイズで見返して、月齢ラベルと AI 本文を書籍的タイポで読む」体験を完成させる。

PRD §1 の公約「**子どもとの今日が、10年後の宝物になる。**」の感情的な到達点。

---

## スコープ (What)

### 新規

- [ ] `src/app/memory/[memoryId]/page.tsx` — Client Component
  - parallel fetch: GET /v1/memories/{id} + GET /v1/children + GET /v1/uploads/{imgId}/url
  - V0 §5.5 レイアウト:
    - フルブリード写真 (4:5、下角だけ rounded 24)
    - meta strip (date / 月齢 / 天気、uppercase tracking +0.08em)
    - 戻る `‹` chevron (warm ivory pill 半透明、左上 absolute)
    - serif title 26px / body 17px / line-height 1.95 (書籍的)
    - 「○○ちゃん、生後 4ヶ月と 7日」hairline 上下で囲った centered italic
  - 3 action glyphs:
    - ❀ おきにいり (PUT /v1/memories/{id} with is_favorite トグル)
    - ✎ ことばを なおす (本Issue では disabled、ちかぢか たいおう )
    - ⋯ けす (DELETE /v1/memories/{id} with 確認ダイアログ)
- [ ] `src/lib/age.ts` — `computeAge` を ISSUE-010 (server-only) から共有化
  - `formatAgeLabel({months, days})` → 「生後 4ヶ月と 7日」形式
- [ ] `tests/unit/lib/age.test.ts` — 月齢 + 整形 9 件
- [ ] このIssueファイル

### 修正

- [ ] `src/app/album/page.tsx` — 各記録カードを `<Link href="/memory/{id}">` にラップ
- [ ] `src/features/ai/server/prompt.ts` — computeAge を `@/lib/age` から re-export に変更

---

## やらないこと (Out of Scope)

- **インライン編集** (title / body / weather / recorded_at) → ISSUE-013a / 別 ISSUE
- **swipe carousel** で複数画像をめくる → 今は縦並びで十分 (MVP は実質 1 枚)
- **「次の ページ / 前の ページ」ナビゲーション** → V0 §5.5 の drag-up affordance は将来 ISSUE
- **AI 生成バッジ表示** → V0 prompt §1「AI is invisible」原則に従い表示しない
- **7 日復元 API** → 退会フロー ISSUE-018 と一緒に
- **share / 月別ふりかえり / お気に入り絞り込み** → 別 ISSUE

---

## 設計判断

### ルートは `/memory/[memoryId]` (singular)

V0 §5.5 と一致。API は `/v1/memories/{id}` (plural collection) だが、user-facing URL は singular instance がきれい (Apple Music の /album/123 等の慣習)。

### 月齢計算は client 側 (`src/lib/age.ts`)

代替案: API レスポンスに `age_at_recorded` を含める → 計算が分散、API 拡張。
採用案: 純粋関数を client 側で実行、`@/lib/age.ts` に集約。Server (ISSUE-010 のプロンプト用) と Client (本Issue) で **同じ実装** を共有。

### 複数画像は縦並び (carousel 無し)

MVP は 1 画像が典型。carousel は swipe lib 依存を増やすコストに対し価値が薄い。
将来必要になったら別 ISSUE で embla-carousel-react 等を導入。

### 削除は 7 日 soft-delete (即時削除しない)

PRD §13 UX「責めないデザイン」+ ADR-0010 §4 (DELETE は論理削除のみ) に従う。
ダイアログで「7にちは もどせます」と明示し、安心感を提供。復元 API は ISSUE-018 で。

### 「ことばを なおす」(編集) は disabled で表示

ボタンの存在は予告 (「ちかぢか たいおう します」)。ユーザーに「ここで編集できる予感」を与える。
完全に隠すと将来追加時に「どこで編集するんだっけ?」となる UX。

### 月齢ラベルの三段階整形

- `生後 14日` (0ヶ月)
- `生後 4ヶ月` (days = 0、ちょうど月末)
- `生後 4ヶ月と 7日` (通常ケース、PRD §13 推奨形)

---

## 影響範囲

| 領域         | 影響                                                           |
| ------------ | -------------------------------------------------------------- |
| OpenAPI      | なし (既存 API で完結)                                         |
| 生成型       | なし                                                           |
| データ       | なし                                                           |
| 画面         | `/memory/[memoryId]` 新規 + `/album` の Link 化                |
| サーバ       | なし                                                           |
| 共有 utility | `src/lib/age.ts` を新設 (ISSUE-010 の computeAge を分離・拡張) |
| CI           | typecheck / lint / format / build / test 全グリーン            |
| ドキュメント | このIssueファイル                                              |
| 環境変数     | なし                                                           |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 既存 211 + 新規 9 = **220 件パス**
- [ ] `/album` の各記録をタップで `/memory/{id}` に遷移
- [ ] 写真がフルブリード 4:5 で表示される
- [ ] meta strip に `2026.05.23 ・ 生後 4ヶ月と 7日 ・ はれ` 形式で出る
- [ ] 本文が serif / line-height 1.95 / 書籍的レイアウト
- [ ] 「○○ちゃん、生後 X」が hairline で囲まれた italic で表示
- [ ] ❀ お気に入りトグルが動く (PUT)
- [ ] ⋯ けす → 確認ダイアログ → DELETE → 1.5s 後に /album へ
- [ ] 他人の memory は 403 で「あなたの ページでは ないようです」
- [ ] 存在しない id は 404 で「この ページは ありません」
- [ ] image signed URL は 30 分 TTL (既存)、画像読み込み中は skeleton

---

## セキュリティ・プライバシー考慮

- [ ] **画像 URL のログ禁止** (一時的とはいえ署名情報を含む。既存 ADR-0009 §5 継続)
- [ ] **他人 memory への 403**: 既存 ISSUE-009 の Route Handler で担保
- [ ] **削除はサーバ側で所有権確認** (既存 DELETE エンドポイント)
- [ ] **論理削除**: 7 日以内は physical には残る (ADR-0010 §4)。退会時 Cascade で最終クリーンアップ

---

## 動作確認手順

```bash
pnpm dev
# /sign-in → /onboarding → /record で 1 件作成
# /album を開く → 記録をタップ
# → /memory/{id} に遷移
# → 写真フル、タイトル、本文、月齢ラベルが見える
# ❀ をタップ → サクラ色に塗りつぶされる
# ⋯ をタップ → 「このページを、けしますか」ダイアログ → 「けす」
# → 1.5s 後 /album へ、削除済みは出てこない
```

---

## 参考

- ISSUE-006c (デザインシステム) — Card / Button / Tailwind v4 トークン
- ISSUE-009 (Memory API) — GET/PUT/DELETE /v1/memories/{id} と signed URL API
- ISSUE-010 (AI) — computeAge の元実装、共有化
- `Hana_PRD_v1.md` §1 / §5 / §7 / §13
- `docs/design/v0-prompt.md` §5.5 (the cry-worthy moment screen)
- ADR-0010 (Memory 論理削除と画像保管)
