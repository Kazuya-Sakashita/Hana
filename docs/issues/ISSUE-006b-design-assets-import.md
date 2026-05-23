---
id: ISSUE-006b
title: V0 デザインアセットの参照方針整備（gitignore + プロンプト保管）
priority: P1
status: review
size: S
created_at: 2026-05-23
---

## 目的 (Why)

V0 AI で生成した「課金可能レベルの Hana モダン UI」一式を、
**設計の正本となるプロンプトだけ git 管理し、生成物はローカル参照のみ** に整備する。

これにより:

- ISSUE-007 以降の全 UI 実装で、プロンプト（設計憲章）が常に参照できる
- 重い V0 出力（1MB / 116 ファイル）をリポジトリに載せずに済む
- ローカルに置いた V0 コードが typecheck / lint / format を壊さない

---

## 背景

- ISSUE-006 で Supabase Auth が動き、認証基盤が確立した
- 次の ISSUE-007（子どもプロフィール）以降、UI の実装が本格化する
- 「課金に値する」品質を担保するため、V0 AI に章 1〜9 のプロンプトを投げて
  20 画面ぶんの Next.js 16 + Tailwind v4 + shadcn/ui ベース UI を生成済み
- ただし V0 出力は **設計の一実現例** であって、長期保管価値は低い
  - 57 個の shadcn/ui は標準コンポーネント（必要なら CLI で再取得）
  - pnpm-lock は当時のバージョン記録（本体 lock と乖離する）
  - mock data・placeholder 画像
- 一方、**プロンプトは設計の正本** として永続価値がある

---

## スコープ (What)

### git 管理する（コミット対象）

- [ ] `docs/design/v0-prompt.md` — V0 への入力プロンプト（章 1〜9・約 1500 行）
- [ ] `docs/design/README.md` — 新規。V0 アセットの扱い方・画面マッピング表・正本ポリシー
- [ ] `.gitignore` に `docs/design/v0-output/` を追加
- [ ] `tsconfig.json` の `exclude` に `docs/design/v0-output` を追加
- [ ] `eslint.config.mjs` の `ignores` に `docs/design/v0-output/**` を追加
- [ ] `.prettierignore` に `docs/design/v0-output/` を追加

### git 管理しない（ローカルのみ）

- `docs/design/v0-output/` — V0 が生成した Next.js プロジェクト一式
  - 用途: ISSUE-007 以降の実装時に「あの画面どう作るんだっけ」を見る
  - 保管期間: 参照不要になったら手元で `rm -rf`
  - 再取得: V0 のセッションから ZIP ダウンロード可能

### やらないこと (Out of Scope)

- 本体 (`src/`) への組み込み → **ISSUE-006c** で実施
- デザイントークン (`globals.css`) の本体反映 → **ISSUE-006c**
- shadcn/ui の本体導入 → **ISSUE-006c**
- `next/font` での Noto Serif JP / Inter 設定 → **ISSUE-006c**
- Framer Motion の本体追加 → **ISSUE-006c**
- 個別画面の本物実装 → **ISSUE-007 以降**
- V0 出力の編集・改善 → 出力は出力としてそのまま。改善が必要なら本体側で対応

---

## 設計判断

### なぜ V0 出力を git 管理しないのか

検討した選択肢:

- **A. 全部コミット** — 1MB / 116 ファイル。レビュアー負荷も上がり、価値の 50% は標準 shadcn/ui
- **B. 厳選してコミット** — 価値の高いものだけ残す。除外リストの維持コストが発生
- **C. ローカルのみ・gitignored** ← **採用**

C を採用した理由:

- 設計の正本は **プロンプト** であり、出力は一実現例にすぎない
- V0 出力をリポジトリに置く価値（オフライン参照・コードレビューでの参照）と
  コスト（リポジトリ肥大化・shadcn 重複・lock 乖離）を比較すると、コストが上回る
- 実装時に手元にあれば十分。チーム共有が必要になったら V0 セッション URL を共有
- 参照不要になったら手元で削除すればよい

### なぜ tooling 設定（tsconfig/eslint/prettier）は残すのか

`docs/design/v0-output/` は gitignored でも、**ローカルには存在する**。
そのまま放置すると以下が壊れる:

- `tsconfig.json` の `include: ["**/*.tsx"]` が V0 のコードまでコンパイル対象に含めて型エラー
- `eslint .` が V0 のコードを lint しようとして大量の警告
- `prettier --check .` が V0 のフォーマット差分を検知

これを防ぐため、各ツールで明示的に対象外とする。
誰かが再ダウンロードしたときの保険にもなる。

### なぜ ISSUE-006b と命名するか

ISSUE-006 (Supabase Auth) で /sign-in の最小 UI を作った直後の文脈で、
UI の設計基準をリポジトリに据えるという連続性がある。

ISSUE-006a (Apple Sign In 後追い) と同じく、ISSUE-006 の延長線上の付帯作業として扱う。

ISSUE-007 以降の番号は予約済み（007 children / 008 storage / 010 AI / 013 onboarding 等）
なので衝突回避の意味もある。

---

## 影響範囲

| 領域              | 影響                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| OpenAPI           | なし                                                                                     |
| 生成型            | なし                                                                                     |
| 本体実装 (`src/`) | **一切手を入れない**                                                                     |
| ドキュメント      | `docs/design/{README.md, v0-prompt.md}` を新規追加                                       |
| 設定              | `.gitignore` / `tsconfig.json` / `eslint.config.mjs` / `.prettierignore` に 1 行ずつ追加 |
| CI                | 影響なし（typecheck/lint/build はそのまま通る）                                          |
| 環境変数          | なし                                                                                     |
| DB                | なし                                                                                     |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `docs/design/v0-prompt.md` がコミット済み
- [ ] `docs/design/README.md` がコミット済み、画面マッピング表が記載
- [ ] `.gitignore` に `docs/design/v0-output/` が追加され、`v0-output/` が git status に表示されない
- [ ] `tsconfig.json` / `eslint.config.mjs` / `.prettierignore` に v0-output の除外設定が入っている
- [ ] ローカルに `docs/design/v0-output/` が存在する状態で `pnpm typecheck` / `lint` / `format:check` / `build` が通る
- [ ] README に「やっていいこと」「やってはいけないこと」「削除の手順」が明示されている
- [ ] README に Phase 2 (ISSUE-006c) の予定が記載されている
- [ ] 本体 (`src/`) は **一切変更されていない**

---

## セキュリティ・プライバシー考慮

- [ ] プロンプト内の mock データに **実在の子ども情報** が含まれていない（ペルソナ「はると」「○○ちゃん」のみ）
- [ ] V0 出力ディレクトリ内に `.env*.local` 等のシークレットが含まれていないことを確認
- [ ] V0 のセッション ID / API キー等がコミット対象に含まれていない

---

## 参考

- ISSUE-006 (Supabase Auth) — 認証基盤
- `docs/design/v0-prompt.md` — V0 への入力プロンプト（設計の正本）
- `docs/design/README.md` — V0 出力の扱い方
- `Hana_PRD_v1.md` §13 UX 設計
- `CLAUDE.md` §1 (鉄則: OpenAPI 駆動 / 生成物の直接編集禁止)
