---
id: ISSUE-014
title: BottomNav (ホーム / アルバム / せってい + 中央 + ボタン) + /settings 最小 stub
priority: P1
status: review
size: S
created_at: 2026-05-25
---

## 目的 (Why)

各画面のリンクが散在していて「アプリ感」が弱かった。V0 prompt §2 に従い
**3 tab + 中央 + ボタン** の永続ナビを導入し、Hana の MVP UX を完成させる。

同時に **sign-out 機能が UI から呼べない gap** を最小 `/settings` で埋める。

---

## スコープ (What)

### 新規

- [ ] `src/components/bottom-nav.tsx` (Client Component)
  - 3 タブ: **ホーム** (`/`) / **アルバム** (`/album`) / **せってい** (`/settings`)
  - 中央 + ボタン (floating、sakura pill、`/record` へ)
  - active route ハイライト: `text-sakura-deep` + 太字
  - 集中フロー (`/sign-in`, `/auth/callback`, `/onboarding`, `/record`) では非表示
  - safe-area 対応 (`pb-safe`)
- [ ] `src/app/settings/page.tsx` (最小 stub)
  - 子どもプロフィール (名前 + 現在の月齢)
  - アカウント (Google OAuth メール)
  - 「そのほか (プロフィール編集 / 通知 / 家族と わかちあう / Hana Plus) は ちかぢか たいおう します」
  - **サインアウト** ボタン (`POST /sign-out` → `/sign-in`)

### 修正

- [ ] `src/app/layout.tsx`: `<BottomNav />` を `<body>` に組み込み
- [ ] `src/app/album/page.tsx`: `pb-28` で nav と被らないように
- [ ] `src/app/memory/[memoryId]/page.tsx`: `pb-16` → `pb-28`

---

## やらないこと (Out of Scope)

- 完全な `/settings` 画面 (プロフィール編集 / 通知 / 家族共有 / Hana Plus) → 該当 ISSUE 群で
- Home 画面 (`/`) のリプレース → ISSUE-012
- 中央 + ボタンに「きろくする」テキストラベル (V0 §2 では first 3 sessions のみ表示と指定) → session 数管理が必要、polish ISSUE で
- アクティブタブのアニメーション
- BottomNav の hide-on-scroll
- Android 系の hamburger menu

---

## 設計判断

### `/settings` を最小 stub で同時実装 (せってい disabled は採用しない)

`/settings` を disabled / コミング・スーンにすると、ユーザーが UI から **サインアウトできない** gap が残る。
本Issueで最小 stub を作ることで:

- 3 タブ構成が破綻しない (V0 §2 と整合)
- sign-out できないバグが解消
- 完全版に書き換えるときの足場ができる

### 集中フローで非表示 (V0 §2 と部分的に異なる判断)

V0 §2 は "Persistent bottom tab bar" だが、Hana の体験設計:

- `/sign-in`, `/auth/callback`: 認証フローでナビを見せても押せない (未認証)
- `/onboarding`: 子どもプロフィール作成中に他へ逃げると体験が壊れる
- `/record`: 30 秒フロー中に集中したい

これらでは BottomNav を hide。コア体験を守る。

### アクティブタブ表現: `text-sakura-deep` + 太字

V0 prompt §1「Whisper not shout」に従い控えめに。ドット / 背景塗りつぶしは主張が強すぎる。

### Album タブは `/memory/*` でも active

詳細画面はアルバムの延長で見ているという認知的モデル。タブをアルバム active にすることで「いまアルバム圏内にいる」感を保つ。

---

## 影響範囲

| 領域         | 影響                                                                |
| ------------ | ------------------------------------------------------------------- |
| OpenAPI      | なし                                                                |
| 生成型       | なし                                                                |
| データ       | なし                                                                |
| 画面         | `/settings` 新規 + `/album` `/memory/[id]` の bottom padding 微調整 |
| Layout       | `<BottomNav />` を `<body>` 末尾に追加                              |
| CI           | typecheck / lint / format / build / test 全グリーン                 |
| ドキュメント | このIssueファイル                                                   |
| 環境変数     | なし                                                                |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 220 件パス
- [ ] BottomNav が `/`, `/album`, `/settings`, `/memory/[id]` で表示
- [ ] BottomNav が `/sign-in`, `/auth/callback`, `/onboarding`, `/record` で非表示
- [ ] 中央 + ボタンで `/record` に遷移
- [ ] active タブが sakura-deep でハイライト
- [ ] `/memory/[id]` 表示時に Album タブが active
- [ ] `/settings` で メール + 子ども + サインアウトが見える
- [ ] サインアウトボタンで `/sign-in` に戻る

---

## セキュリティ・プライバシー考慮

- [ ] **email を表示** するが、これは認証ユーザー本人なので問題なし
- [ ] **サインアウトはサーバ側で session 破棄** (既存 `/sign-out` Route Handler が `signOut({ scope: 'global' })`)
- [ ] **BottomNav に通知バッジ等のサーバ依存表示は無い** → ISSUE-017 push 通知で追加検討

---

## 動作確認手順

```bash
pnpm dev
# 1. /sign-in → サインイン → BottomNav は出ない
# 2. サインイン後 / に着く → BottomNav 表示、ホームが active
# 3. アルバム タブを押す → /album、アルバムが active
# 4. 記録をタップ → /memory/{id}、Album タブが active のまま
# 5. + ボタンを押す → /record、BottomNav は出ない (集中フロー)
# 6. 「のこす」完了 → /album → BottomNav 復活
# 7. せってい タブ → /settings、メール / 子ども / サインアウトが表示
# 8. サインアウト → /sign-in に戻る、BottomNav は出ない
```

---

## 参考

- ISSUE-006c (デザインシステム) — shadcn ベース
- ISSUE-009 / ISSUE-013 / ISSUE-015 — 各画面の動線
- `docs/design/v0-prompt.md` §2 (Global layout) / §5.14 (Settings 完全版)
- V0 prompt §1「Whisper not shout」「Album not feed」
