---
id: ISSUE-012
title: ホーム画面 (`/`) を V0 §5.2 ベースに刷新
priority: P0
status: review
size: M
created_at: 2026-05-25
---

## 目的 (Why)

`/` は ISSUE-006c 以降 `<h1>Hana</h1>` だけの placeholder で、BottomNav (ISSUE-014) からホームに戻ったとき **空っぽな印象** だった。
V0 prompt §5.2 ホーム画面に従い、Hana の MVP として「人に見せられる」レベルの入口体験を作る。

---

## スコープ (What)

### 修正

- [ ] `src/app/page.tsx` (Client Component) を V0 §5.2 ベースに刷新
  - Parallel fetch: `/v1/me` + `/v1/children` + `/v1/memories?limit=5`
  - **Top bar**: 時間帯挨拶 + 子どもアバター (40px circle、名前のイニシャル fallback)
  - **Hero card**: 「今日の ○○ちゃんを、のこしませんか」→ `/record`
  - **さいきんの ページ**: 横スクロール 5 件 (4:5 サムネ + 序文)、最後に「もっとみる →」→ `/album`
  - **これまでの あゆみ**: 3 列 stat (ページ数 / 月齢 / 一緒に過ごした日数)
  - **空状態** (memory 0): ❀ illustration + 「○○ちゃんとの 1まいめを、ひらきましょう」+ sakura pill button
  - **子ども未登録**: `/onboarding` へ redirect

### やらないこと

- **1年前の今日** card → ISSUE-017 (push 通知 + 1年前) で本格対応
- **月別フィルタ** ("今月の N ページ") → ISSUE-016 月別ふりかえりで API 拡張
- 子ども切替シート → 1 ユーザー 1 子ども (ADR-0008) のため不要
- アバター画像 → ISSUE-008 で `avatar_url` 未実装。イニシャル fallback で代替

---

## 設計判断

### 時間帯挨拶は `useSyncExternalStore` で hydration mismatch 回避

V0 §5.2: 06-11 おはよう / 11-17 こんにちは / 17-22 こんばんは / 22-06 おかえりなさい。
サーバとクライアントで時刻が違うと hydration error になる。`useState + useEffect` だと React 19 lint rule (setState in effect) に当たる。

`useSyncExternalStore` を使うと **server snapshot を別途返せる** ので canonical な解決:

```ts
const greetingText = useSyncExternalStore(
  () => () => undefined, // no subscribe
  () => greeting(), // client snapshot
  () => 'こんにちは', // server fallback (固定)
)
```

### 子ども未登録 → /onboarding redirect

ホームで「お子さん登録 CTA」を出す案もあったが、動線が分散する。
**`/onboarding` がガイド導線として既にある** ので、そこに集中させる。

### 「これまでの あゆみ」を全体カウントで代替

V0 §5.2 は「ことしの 5月 / 5ページ」のような月別表示。これは API に月別フィルタが要る。
本Issue では MVP 体験を優先し、**全体カウント** で代替:

- `N ページ` (全 memory 件数)
- `Xヶ月と Y日` (子ども月齢)
- `N日` いっしょ (child.created_at からの経過日数)

月別フィルタは ISSUE-016 で `GET /memories?recorded_at_from=...` を追加してから本来形に。

### サムネ取得は `/album` と同じ並列パターン

`Promise.all(memories.map(m => GET /uploads/{m.image_ids[0]}/url))` で 5 件並列。
失敗時は ❀ placeholder (V0 §4「責めないデザイン」)。

### Hero card クリック領域

V0 §5.2「The entire card is tappable, with a 0.97 press scale」。Card 全体を `<Link>` でラップ + `active:scale-[0.97]` + `ease-organic`。

---

## 影響範囲

| 領域         | 影響                                                |
| ------------ | --------------------------------------------------- |
| OpenAPI      | なし                                                |
| 生成型       | なし                                                |
| データ       | なし                                                |
| 画面         | `/` をリプレース (placeholder → V0 §5.2)            |
| サーバ       | なし                                                |
| CI           | typecheck / lint / format / build / test 全グリーン |
| ドキュメント | このIssueファイル                                   |
| 環境変数     | なし                                                |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 220 件パス
- [ ] `/` で時間帯別挨拶が出る
- [ ] 子どもアバター (イニシャル) が右上に表示、`/settings` へリンク
- [ ] Hero card タップで `/record` へ
- [ ] さいきんのページ 横スクロール (サムネ取得中は warm skeleton)
- [ ] これまでの あゆみ stat strip (ページ数 / 月齢 / いっしょ日数)
- [ ] memory 0 件で empty state (❀ + CTA)
- [ ] 子ども未登録 → `/onboarding` redirect
- [ ] BottomNav (ISSUE-014) と共存、ホームが active

---

## 動作確認手順

```bash
pnpm dev
# 1. /sign-in → サインイン → / に着く
# 2. 時間帯に応じた挨拶が出る (おはよう/こんにちは/こんばんは/おかえりなさい)
# 3. 右上にアバター (イニシャル) → タップで /settings
# 4. Hero card → タップで /record
# 5. さいきんのページ 横スクロール、サムネ + タイトル
# 6. これまでの あゆみ: N ページ / X ヶ月と Y 日 / N 日 いっしょ
# 7. 記録を全部消すと empty state ❀ + CTA
# 8. 子ども情報を消すと /onboarding へ自動 redirect
```

---

## 参考

- `docs/design/v0-prompt.md` §5.2 (Home)
- ISSUE-006c (デザインシステム) — Card / Button / tokens
- ISSUE-014 (BottomNav) — 表示判定で共存
- ISSUE-015 (サムネ) — 並列フェッチ pattern
- ISSUE-016 (月別ふりかえり、未着手) — 月別フィルタ API
- ISSUE-017 (1年前の今日 push、未着手) — 1年前 card
- V0 prompt §1「Whisper not shout」「Forgive the user」
