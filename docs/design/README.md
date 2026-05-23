# Hana デザインアセット

> このディレクトリは **デザイン段階の成果物** を保管する場所。
> Hana 本体の実装（`src/`）からは **参照のみ**。コピペや import はしない。

---

## 構成

```
docs/design/
├── README.md       このファイル
├── v0-prompt.md    V0 AI に投げたプロンプト集（章 1〜9）— git 管理
└── v0-output/      V0 AI が生成した Next.js プロジェクト一式
                    （ローカル参照のみ・gitignored・参照不要になったら手元で削除）
```

---

## v0-output/ の扱い（重要）

| 項目               | 方針                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| **保管場所**       | `docs/design/v0-output/`（このリポジトリ内のディレクトリ）                  |
| **git 管理**       | **しない**（`.gitignore` 済み）                                             |
| **用途**           | ローカルで「あの画面どう作るんだっけ」を見る参考資料                        |
| **誰が見られるか** | V0 から自分でダウンロードした人だけ                                         |
| **いつ削除するか** | ISSUE-007 以降の UI 実装が一通り終わって、参照不要になったら手元で `rm -rf` |

### なぜ git 管理しないのか

- V0 出力は **1MB / 116 ファイル**。うち 57 個は標準 shadcn/ui コンポーネント、
  132K は pnpm-lock。リポジトリに置く価値が低い割にサイズが大きい
- shadcn/ui は本体導入時に `pnpm dlx shadcn@latest add` で取得するのが正攻法
- mock data や placeholder 画像は本物ではない
- V0 出力は「設計の一実現」であって、設計の正本ではない
  （**設計の正本は `v0-prompt.md` の方**）

### なぜ即削除しないのか

- ISSUE-007 以降の UI 実装で「この画面どう組んだっけ」を見る用途がある
- プロンプトだけだと、実装時の細部判断（余白・モーション・コンポーネント分割）が再現しづらい
- 動かしてみれば確認できる（後述）

---

## ローカルで参照する手順

### 1. V0 出力をダウンロード

V0 のセッションから ZIP をダウンロードし、`docs/design/v0-output/` に展開する。

```bash
# 例: ~/Downloads/hana/ に展開した場合
rsync -a --exclude='.DS_Store' ~/Downloads/hana/ docs/design/v0-output/
```

### 2. 動かして見る（任意）

```bash
cd docs/design/v0-output
pnpm install
pnpm dev
# → http://localhost:3000 で V0 のモックアップを閲覧
```

**注意**:

- 起動するのは「V0 が作ったプロジェクト」であって Hana 本体ではない
- ポート 3000 が本体と被るので、本体 dev を止めるか別ポートで起動
- mock data なので、データ追加・編集はリロードで消える
- Supabase / 認証は **何も繋がっていない**

### 3. 参照しながら本体を実装

ISSUE-007 以降の画面実装で「V0 の onboarding 画面はどう組まれているか」を読み、
本物の API（openapi-fetch + Supabase）に繋いだ実装を **`src/app/` に新規で書く**。

### 4. 参照不要になったら削除

```bash
rm -rf docs/design/v0-output
```

---

## やってはいけないこと

| ❌ NG                                         | 理由                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `v0-output/app/` を `src/app/` に丸ごとコピー | mock data がそのまま本番に入る。CLAUDE.md §1 と矛盾 |
| `v0-output/` を import パスに含める           | git 管理外なので他人のクローンに存在しない          |
| `v0-output/` 内のファイルを直接編集           | 出力の由来情報が失われる。修正は `src/` 側で        |
| `v0-output/` を `git add -f` で強制追加       | gitignore の意図を破る                              |

---

## やっていいこと

| ✅ OK                                                                                                    | やり方                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| ローカルで `cd v0-output && pnpm install && pnpm dev` で **見るだけ**                                    | デザイン確認のためなら歓迎            |
| `v0-output/components/ui/button.tsx` を参考に本体に `button.tsx` を作る                                  | コードを「読んで」「書き直す」のは OK |
| `v0-output/app/onboarding/page.tsx` を見ながら、本物の API に繋いだ `src/app/onboarding/page.tsx` を実装 | これが正しい使い方                    |
| デザイントークンを抽出して `src/app/globals.css` に手動コピー                                            | デザインシステム導入の正攻法          |

---

## 画面マッピング表（プロンプト章 5 ↔ V0 出力ディレクトリ）

| 章          | プロンプト画面名                | V0 出力                                              |
| ----------- | ------------------------------- | ---------------------------------------------------- |
| 5.1         | オンボーディング                | `v0-output/app/onboarding/`                          |
| 5.2         | ホーム                          | `v0-output/app/page.tsx`                             |
| 5.3         | 写真→AI→確認                    | `v0-output/app/record/`                              |
| 5.4         | タイムライン                    | `v0-output/app/album/`                               |
| 5.5         | 記録詳細                        | `v0-output/app/memory/`                              |
| 5.6         | 月別ふりかえり                  | `v0-output/app/recap/`                               |
| 5.7         | プレミアム                      | `v0-output/app/premium/`                             |
| 5.8         | LP                              | `v0-output/app/lp/`                                  |
| 5.9         | スプラッシュ                    | `v0-output/app/splash/`                              |
| 5.10–5.13   | 認証ハブ / メール / 確認 / 権限 | `v0-output/app/auth/` / `v0-output/app/permissions/` |
| 5.14–5.24   | 設定系                          | `v0-output/app/settings/`                            |
| 5.18–5.19   | 家族共有                        | `v0-output/app/invite/`                              |
| 5.25–5.26   | ヘルプ / フィードバック         | `v0-output/app/help/` / `v0-output/app/feedback/`    |
| 5.23 / 5.36 | リーガル                        | `v0-output/app/legal/`                               |
| 5.27–5.31   | 写真閲覧 / 検索 / ゴミ箱        | `v0-output/app/search/` / `v0-output/app/trash/`     |
| 5.32        | フォトブック                    | `v0-output/app/photobook/`                           |
| 5.33        | エラー状態                      | `v0-output/app/error/`                               |

---

## ツール設定について

`docs/design/v0-output/` を **ローカルに置いたまま** typecheck / lint / format が壊れないよう、
以下の設定で V0 のコードを各ツールの対象外にしてある:

- `tsconfig.json` の `exclude` に `docs/design/v0-output`
- `eslint.config.mjs` の `ignores` に `docs/design/v0-output/**`
- `.prettierignore` に `docs/design/v0-output/`

これらは v0-output が手元に存在するときに必要で、削除後も残しておいて問題ない
（誰かが再ダウンロードしたときの保険）。

---

## Phase 2 以降の計画

このディレクトリは「参照」であって、本体への取り込みは別 ISSUE で段階的に行う:

1. **ISSUE-006c**（予定）: デザインシステム導入
   - `globals.css` のデザイントークン本体反映
   - `next/font` で Noto Serif JP / Inter 設定
   - `components.json` + 必要な shadcn/ui コンポーネント導入
   - Framer Motion 依存追加
2. **ISSUE-007**: 子どもプロフィール API + 画面（V0 の onboarding / settings/child を参照）
3. **ISSUE-008**: 写真アップロード + Storage（V0 の record を参照）
4. **ISSUE-010**: AI 生成統合（V0 の record / memory を参照）
5. …以降の各機能 ISSUE で V0 出力を参照しながら本物の API に繋いだ実装を行う

---

## デザインの「正本」はどれか

| 役割                  | ファイル               | git 管理           |
| --------------------- | ---------------------- | ------------------ |
| **設計憲章 (正本)**   | `v0-prompt.md` 章 1〜4 | ✅                 |
| **画面別仕様 (正本)** | `v0-prompt.md` 章 5    | ✅                 |
| **設計の一実現例**    | `v0-output/`           | ❌（ローカルのみ） |

V0 出力と本体実装が食い違ったときは、**プロンプト側を正** とする。
