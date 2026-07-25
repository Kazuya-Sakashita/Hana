---
title: LP-App Visual Grammar
last_updated: 2026-07-25
owner: kazuya
issue: ISSUE-076
requires_human_review:
  - design
  - accessibility
  - privacy
---

# LP-App Visual Grammar

この文書は、LP と本体アプリが同じ Hana に見えるための橋渡し契約である。
`quiet-heirloom-design-canon.md` の原則を、LP / 参照画像 / 現行アプリの差分に合わせて
実装判断と QA gate に落とし込む。

## 判断

10 名分の専門レビューを統合した結論は次の通り。

- 色 token、角丸 token、sage CTA の方向は、LP と本体アプリでかなり近い
- ズレの主因は palette ではなく、`photo mat` / `paper slip` / icon / bottom action の使い分けが画面ごとに散っていること
- 画面単位で個別に磨く前に、共通 primitive と icon language を固定する
- 生成画像や LP artifact は mood evidence として使い、画像内の文言や trust claim は本番 UI に転記しない
- 後続実装では `quiet icon` を「細い線、控えめな色、情報の主役にならない操作記号」として扱う

## Input Evidence

この文書は次の証跡をもとに作成した。いずれも visual direction の参照であり、
copy、privacy claim、AI 同意文言の正本ではない。

- ユーザー添付の参照画像 `生成画像1.png`。会話内の mood evidence として扱い、リポジトリには追加しない
- `docs/design/artifacts/current-lp/index.html`
- `docs/design/current-lp-evaluation.md`
- 2026-07-25 の Codex thread 内で実施した 10 名の read-only 専門レビュー

## Visual Grammar

| 要素        | App 実装契約                                                                | Hold 条件                                                        |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| canvas      | warm ivory / washi base。画面全体は淡い紙の余白として扱う                   | dark blue、purple gradient、beige だけの one-note palette に戻る |
| photo mat   | 写真、thumbnail、placeholder は `photo-mat` と内側 `photo-inner` の組で扱う | 画像だけが裸で置かれ、LP の丸い台紙感とつながらない              |
| paper slip  | 説明、preview、trust summary は薄い紙片として扱う                           | card が積み上がり、dashboard / settings list に見える            |
| primary CTA | 記録、保存、完了、待機リストは sage pill を基本にする                       | sakura の大面積 CTA、強い shadow、浮きすぎた FAB                 |
| sakura      | favorite、focus、pressed flower、小さな brand accent に限定する             | 本文、小さい helper text、大面積背景、primary CTA に使う         |
| shadow      | 通常 surface は hairline + 余白、前面 sheet だけ浅い shadow                 | glassmorphism、濃い drop shadow、SaaS dashboard 風 elevation     |
| typography  | UI は読みやすさ優先、見出しと物語本文は serif で静かに読ませる              | hero-scale type を compact panel や小ボタンに持ち込む            |

## Icon Language

Hana の操作 icon は lucide を標準とする。custom icon は product app icon、wordmark、
pressed flower / knot divider のような装飾だけに限定する。操作そのものに装飾花を使わない。

| 用途             | 推奨 icon                                     | tone                                           | stroke                     | 備考                                                       |
| ---------------- | --------------------------------------------- | ---------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| bottom home      | `House` または `Home`                         | inactive `ink-tertiary`, active `leaf-deep`    | inactive 1.65 / active 1.9 | 生活の場所として見せる                                     |
| bottom album     | `BookOpen`                                    | inactive `ink-tertiary`, active `leaf-deep`    | inactive 1.65 / active 1.9 | gallery / feed ではなく private shelf                      |
| bottom settings  | `Settings` または trust surface では `Shield` | inactive `ink-tertiary`, active `leaf-deep`    | inactive 1.65 / active 1.9 | 歯車が強い場合は trust 文脈で調整                          |
| record primary   | `ImagePlus`, `Camera`, `Check`                | `leaf-deep`                                    | 1.75-1.85                  | `+` 単体より「写真を残す」行為を示す                       |
| write / AI draft | `PenLine`, `FileText`                         | `ink-secondary`                                | 1.75                       | `Sparkles` / `WandSparkles` は AI が前に出すぎるため避ける |
| favorite         | `Heart`                                       | inactive `ink-tertiary`, active `sakura-deep`  | 1.75                       | fill を許可する例外は favorite のみ                        |
| delete / warning | `Trash2`, `AlertCircle`                       | neutral は `ink-secondary`, confirm は `amber` | 1.75                       | favorite と同列の強い action にしない                      |
| metadata         | `Calendar`, `Tag`, `LayoutGrid`, `Ellipsis`   | `ink-tertiary`                                 | 1.6-1.75                   | 情報の主役にしない                                         |

## Screen Priority

LP の約束を傷つけやすい順に、実装 Issue を切る。

| 優先 | screen               | 方針                                                                                     |
| ---- | -------------------- | ---------------------------------------------------------------------------------------- |
| P0   | Record               | 写真選択後の主判断を 1 つに絞り、保存前 preview を `photo mat + paper slip` に寄せる     |
| P0   | Memory Detail        | 写真と本文を主役にし、保存直後 notice と action band を控えめにする                      |
| P1   | Sign-in / Onboarding | 汎用 card 感を減らし、LP の余韻を保つ入口にする。未確約の OAuth / Store 表現を増やさない |
| P1   | Settings             | trust summary と詳細を分け、実装済み操作と future を曖昧にしない                         |
| P2   | Album                | featured page と一覧を private shelf として見せ、多件数でも feed にしない                |
| P2   | Home                 | 既に近い。stats と CTA が dashboard 感を出しすぎないようにする                           |

## Follow-up Issue Split

`ISSUE-076` では本契約と gate を固定し、画面実装は次の Issue に分ける。

| issue       | title                                         | scope                                                                                    |
| ----------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ISSUE-077` | 共通 keepsake primitive と icon language 実装 | `PhotoMat`, `PaperSlip`, `QuietIcon`, `QuietIconButton`, `Textarea`, `WarmDialogOverlay` |
| `ISSUE-078` | Record 30秒 one-decision flow alignment       | 写真台紙、下部 sheet、primary action、保存前 preview                                     |
| `ISSUE-079` | BottomNav と action icon の quiet alignment   | 中央 action、active indicator、toast close、44px tap target                              |
| `ISSUE-080` | Sign-in / Onboarding / Settings trust bridge  | 入口、初回登録、trust overview、未確認 claim 抑制                                        |
| `ISSUE-081` | Album / Memory Detail private shelf polish    | favorite / delete、一覧密度、保存直後 notice                                             |
| `ISSUE-082` | LP-App visual parity QA gate                  | screenshot matrix、contrast、tap target、evidence safety                                 |

上記は候補 ID であり、対応する `docs/issues/ISSUE-XXX-*.md` が作成され、受け入れ条件と
検証手順が書かれるまで Codex-ready ではない。Home は現状の一致度が高いため専用 P0 にはしないが、
`ISSUE-077` の primitive 化と `ISSUE-082` の screenshot matrix で必ず確認し、first view のズレが
残る場合は Home 専用 follow-up を追加する。

## LP-App QA Gate

| gate            | Go 条件                                                                                                                  | No-Go / Hold 条件                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| token parity    | LP と app の canvas / paper-slip / photo-mat / ink / sage / sakura / radius token が一致、または差分理由が記録されている | 差分理由のない token drift                          |
| surface parity  | Home は写真台紙、Record は写真 + 下部 sheet、Album は private shelf、Memory Detail は写真と本文が action より先          | 説明 card、一覧 list、操作 menu が主役に戻る        |
| icon parity     | lucide icon の語彙、stroke、色、fill 例外が共通規約に沿う                                                                | 文字 glyph、線幅 default 2 の散在、AI sparkles 多用 |
| accessibility   | 全 interactive target は 44px 以上、primary CTA は 48px 以上、色だけに依存しない active state                            | 小さな text button、sakura 小文字、focus clipped    |
| contrast        | body text は 7:1 目標、helper / status text は 4.5:1 以上、focus indicator と non-text UI は 3:1 以上                    | sakura や leaf を小文字 text に使い、比率を測らない |
| evidence safety | screenshot / manifest / PR body に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールがない         | いずれかが証跡に残る                                |
| trust copy      | privacy / legal review 前の vendor retention、ZDR、完全削除、復元可能などを断定しない                                    | visual score で trust blocker を相殺する            |

## Screenshot Matrix

| 対象                            | 状態                                                                                | Viewports                            |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| LP                              | hero、Before/After、product preview、trust / final CTA                              | 390x844、430x932、768x1024、1280x900 |
| Home                            | empty、1 memory、5 memories、long child name                                        | 390x640、390x844、430x932、768x1024  |
| Record                          | empty、photo selected、AI consent、generating、manual save ready、save ready、error | 390x640、390x844、430x932            |
| Album                           | empty、featured + shelf、long title / body、load more / end                         | 390x844、430x932、768x1024           |
| Memory Detail                   | saved notice、normal、long body、additional photos                                  | 390x844、430x932                     |
| Sign-in / Onboarding / Settings | auth entry、first-memory bridge、trust surface                                      | 390x844、430x932                     |

## Evidence Policy

- 参照画像は質感の参考に留め、画像内 copy / trust claim を本番 UI に採用しない
- 子どもの実名、親の実名、メール、生年月日、実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さない
- child name が必要な QA は `はな` / `あお` の synthetic name に限定する
- 30 秒記録の測定条件は `quiet-heirloom-design-canon.md` の 30 秒計測ルールを使う
- Privacy Trust / Content Safety / Accessibility / Task Success の No-Go は平均点で相殺しない
