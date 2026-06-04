---
id: ISSUE-030
title: アルバム一覧サムネをホーム「さいきんの ページ」と同じ表示方針に統一
priority: P2
status: todo
size: S
created_at: 2026-05-27
---

## 目的 (Why)

ホーム画面の「さいきんの ページ」 carousel と、 アルバム一覧 (`/album`) のサムネで **見た目の方針が分裂** している。 同じ「memory のサムネ」 という機能なのに視覚言語が違う:

| 項目        | home carousel    | album 一覧 (現状)   |
| ----------- | ---------------- | ------------------- |
| aspect      | `aspect-[4/5]`   | `aspect-square`     |
| size        | `w-full` (140px) | `h-20 w-20` (80×80) |
| rounded     | `rounded-2xl`    | `rounded-xl`        |
| object-fit  | `object-cover`   | `object-contain`    |
| placeholder | `text-3xl`       | `text-2xl`          |

album 側で object-contain + 正方形にしたのは ISSUE-019 検証中の応急処置 (extreme クロップ回避) だったが、 ISSUE-019 で transformation が resize=contain になりアスペクトが保持される今、 **正常 crop に戻して home と統一** できる。

V0 §1「Whisper not shout」 と「視覚言語の一貫性」 の観点で、 同じ要素は同じスタイルにすべき。

---

## スコープ (What)

### 修正

- [ ] `src/app/album/page.tsx` の `Thumbnail` コンポーネント:
  - `aspect-square h-20 w-20` → `aspect-[4/5] w-20` (= 80×100)
  - `rounded-xl` → `rounded-2xl`
  - `object-contain` → `object-cover`
  - `overflow-hidden` 削除 (rounded + border で吸収、 home に倣う)
  - ❀ placeholder の `text-2xl` → `text-3xl`
  - skeleton (フェッチ中) も同じ aspect / rounded に

### やらないこと

- home 側は **完全に現状維持** (基準)
- `/memory/[id]` の本画像表示 (4:5 で既に統一済)
- album のカードレイアウト・行間
- 関連する OpenAPI / サーバ / テストの変更 (純粋に CSS のみ)

---

## 設計判断

### サイズは `w-20` (80px wide → aspect-[4/5] で 100px tall)

home は w-full (= 140 wide × 175 tall) だが、 album は **横並び (image + text)** のレイアウトなので画像が大きすぎると本文が圧迫される。 80×100 は現行 80×80 から 20px だけ縦に伸びる程度で、 行高は許容範囲。

### object-cover に戻す理由

- ISSUE-019 で transformation が `resize=contain` (アスペクト保持) になったので、 サーバ側でクロップされていない
- 4:5 container + object-cover は home でも採用 → 視覚的に統一
- 80×100 (4:5 container) は 80×80 (1:1) より縦に長いので、 portrait 写真 (= 多数派) は自然に収まる
- landscape 写真は左右が多少クロップされるが、 home 側でも同じ挙動 = 一貫

### `overflow-hidden` を外す

home は `rounded-2xl border` で済ませている。 album も同じ。 `<img>` は object-cover で container に収まるので overflow しない。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/album` のサムネ表示のみ                |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [ ] `/album` のサムネが 4:5 portrait + rounded-2xl + object-cover で表示される
- [ ] home carousel の見た目は変わらない (基準維持)
- [ ] portrait 写真 / landscape 写真の両方で被写体中央が見える
- [ ] ❀ placeholder / フェッチ中 skeleton も同じ aspect で表示される

---

## 動作確認手順

```bash
pnpm dev
# 1. / を開く → 「さいきんの ページ」 carousel のサムネを基準として目視
# 2. /album を開く → サムネが home と同じ aspect / rounded / クロップ感
# 3. 画像なしのメモがあれば ❀ placeholder が 4:5 で出ること
# 4. ハードリロードでフェッチ中 skeleton も 4:5 で表示されること
```

---

## 参考

- ISSUE-015 (album 初期サムネ実装)
- ISSUE-019 (transformation resize=contain、 本変更の前提)
- V0 prompt §1 / §5.2 (home carousel) / §5.4 (album list)
