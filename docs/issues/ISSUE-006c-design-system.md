---
id: ISSUE-006c
title: デザインシステム導入 (Tailwind v4 + 和紙色トークン + shadcn 最小セット + Noto Serif JP)
priority: P1
status: review
size: M
created_at: 2026-05-23
---

## 目的 (Why)

ISSUE-007 以降の全画面実装で「課金に値する」温度感を最初から出すために、
Hana のデザインシステム基盤 (Tailwind v4 + デザイントークン + shadcn/ui 最小セット +
Noto Serif JP / Inter フォント + motion) を本体に導入する。

`docs/design/v0-prompt.md` 章 1〜4 で定義した **設計憲章**（和紙色パレット・
"Album not feed"・"Whisper not shout"・"Forgive the user"）をコードで実体化する。

---

## 背景

- ISSUE-006 で /sign-in を inline style の最小 UI で作った
- ISSUE-006b で V0 デザイン参照アセット (ローカル only) を整備し、設計の正本である
  プロンプトを `docs/design/v0-prompt.md` に保管した
- 次の ISSUE-007 (子どもプロフィール画面) から本格的に UI を実装するので、
  その前にデザインの「枠組み」を据えておく

---

## スコープ (What)

### 依存パッケージ

- [x] `tailwindcss@4` + `@tailwindcss/postcss` + `postcss` + `tw-animate-css` (dev)
- [x] `class-variance-authority` + `clsx` + `tailwind-merge` (cn / cva 用)
- [x] `lucide-react` (アイコン)
- [x] `motion` v12 (旧 framer-motion・公式リネーム)
- [x] `@radix-ui/react-slot` + `@radix-ui/react-label` (shadcn 基盤)

### 新規ファイル

- [x] `postcss.config.mjs` — Tailwind v4 用 PostCSS 設定
- [x] `src/app/globals.css` — Tailwind v4 + Hana デザイントークン (和紙色 / dark midnight / @theme inline)
- [x] `src/lib/utils.ts` — `cn()` ヘルパー (clsx + tailwind-merge)
- [x] `components.json` — shadcn CLI 設定 (後で `pnpm dlx shadcn@latest add` で追加可能)
- [x] `src/components/ui/button.tsx` — Hana 流 Button (default は rounded-full / sakura)
- [x] `src/components/ui/card.tsx` — Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter
- [x] `src/components/ui/input.tsx` — Input (鉛色 hairline、focus で sakura ring)
- [x] `src/components/ui/label.tsx` — Label (Radix Root ラッパ)

### 既存ファイル更新

- [x] `src/app/layout.tsx` — `next/font/google` で Inter + Noto Serif JP、`globals.css` import
- [x] `src/app/sign-in/page.tsx` — inline style → Tailwind + shadcn Button/Card に刷新

### やらないこと (Out of Scope)

- shadcn 追加コンポーネント (dialog / sheet / drawer / avatar / badge / 等) → 必要な ISSUE で `pnpm dlx shadcn add` 追加
- `next-themes` Provider 導入 → トークンだけ用意。dark mode UI 切替は将来 ISSUE で
- BottomNav / カスタム components (icons / theme-provider) → ISSUE-007 以降で必要な分だけ
- 個別画面実装 (オンボーディング・ホーム・アルバム等) → ISSUE-007 以降
- アニメーションプリミティブ (`PageTransition` 等) のユーティリティ整備 → 必要なときに追加

---

## 設計判断

### Tailwind v4 を採用 (v3 ではなく)

採用理由:

- V0 prompt §1 で「Tailwind v4」を指定済み
- `@theme inline` で CSS 変数と Tailwind utility を一体管理できる
- `tailwind.config.js` 不要で設定が CSS に集約される
- shadcn/ui の最新版が v4 を一級サポート

### Hana raw tokens + shadcn-compatible tokens の二段構え

`globals.css` で `--bg-canvas` (Hana 固有) と `--background` (shadcn 互換) を分け、
後者は前者を参照する。`@theme inline` で両方を Tailwind utility に出している
(`bg-canvas` / `bg-background` どちらも使える)。

採用理由:

- shadcn コンポーネントは `--primary` 等を前提に書かれているので、そのまま動かしたい
- Hana 独自のセマンティクス (`bg-warm`, `text-ink-tertiary`, `text-amber` 等) は
  別途 utility として出して、画面コードを読みやすくしたい

### Button の primary 既定値を `rounded-full` (pill) に

shadcn 既定は `rounded-md` だが、V0 prompt §1 で「primary は pill」と指定。
セカンダリ系 (outline / ghost / secondary) は `rounded-xl` で 12px 角丸を維持。

### motion v12 採用 (framer-motion v12 ではなく)

両者は **同じパッケージの公式リネーム**。motion v12 が現行公式名。
依存ツリーは同一。

### `next-themes` Provider は未導入

V0 prompt §4「ship light first」に従い、dark mode の token だけ用意して
toggle UI / Provider は将来 ISSUE で。SSR flicker 対策の手間を MVP に持ち込まない。

---

## 影響範囲

| 領域         | 影響                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| OpenAPI      | なし                                                                              |
| 生成型       | なし                                                                              |
| データ       | なし                                                                              |
| 画面         | `/sign-in` の見た目刷新 (機能は同一)                                              |
| 認証         | なし (Supabase 連携は無変更)                                                      |
| CI           | typecheck / lint / build / format / test 全て通る                                 |
| ドキュメント | このIssueファイル                                                                 |
| 依存         | 11 パッケージ追加 (Tailwind v4 系 4 + cva/clsx/twm 3 + Radix 2 + lucide + motion) |

---

## 受け入れ条件 (Acceptance Criteria)

- [x] `pnpm typecheck` グリーン
- [x] `pnpm lint` グリーン
- [x] `pnpm format:check` グリーン
- [x] `pnpm build` 成功 (`/`, `/sign-in`, `/auth/callback`, `/sign-out`, `/v1/me` 全 route ビルド可)
- [x] `pnpm test` 32 件パス (auth 系 unit/integration テストが壊れていない)
- [x] Tailwind utility (`bg-canvas`, `text-ink`, `text-sakura`, `font-serif` 等) が使える
- [x] shadcn `Button` / `Card` / `Input` / `Label` が import できる
- [x] `/sign-in` が新しいデザインで表示される (Card + 中央寄せ + 温かい copy + Google ボタン)
- [x] `cn()` ヘルパが `@/lib/utils` から使える
- [x] dark mode token が `.dark` クラスに定義済み (Provider は未導入で OK)
- [x] `docs/design/v0-prompt.md` 章 1 の token がすべて `globals.css` に実体化

---

## セキュリティ・プライバシー考慮

- [x] フォントは `next/font/google` で **self-host** (CDN 経由ではない・トラッキング無し)
  - `display: 'swap'`、`Noto Serif JP` は `preload: false` (重いので必要時のみ)
- [x] motion v12 / lucide-react / Radix は client-side ライブラリで PII を扱わない
- [x] ログ・テストフィクスチャに PII を含まない (新規ファイルは全て静的)

---

## 動作確認手順

```bash
pnpm install   # 依存解決
pnpm dev
# → http://localhost:3000/sign-in
# → Card に囲まれた "Hana にサインイン" + "Google で つづける" ボタン
# → 温かい和紙色背景・Noto Serif JP heading
# → ボタンクリックで Google OAuth (ISSUE-006 のフローがそのまま動く)
```

---

## 参考

- `docs/design/v0-prompt.md` 章 1〜4 (設計憲章・正本)
- `docs/design/README.md` (V0 アセットの扱い方)
- ISSUE-006 (Supabase Auth・/sign-in の inline 実装)
- ISSUE-006b (V0 デザインアセット参照方針)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/)
- [shadcn/ui — Components](https://ui.shadcn.com/docs/components)
- [motion v12](https://motion.dev/)
