# Hana Quiet Heirloom デザイン正本

この文書は `ISSUE-053` の成果物として、Hana の大幅デザイン見直しで採用する方向性を固定する。
実装時は `Hana_PRD_v1.md`、`docs/design/design-evaluation-rubric.md`、
`docs/design/lp-app-visual-grammar.md`、
`docs/design/design-inventory-roadmap.md`、`docs/design/ai-consent-privacy-evidence.md`、
`docs/design/photo-alt-privacy-policy.md`、`docs/design/delete-restore-trust-contract.md` と合わせて読む。

## 採用方針

Hana の次の UI 方向性は **Quiet Heirloom** とする。

親に「毎日ちゃんと記録しよう」と迫るアプリではなく、
写真 1 枚をきっかけに、小さな記憶を静かに残せる私的なアルバムとして設計する。
AI は主役ではなく、言葉が出ない時だけそっと下書きする黒子として扱う。

## コンセプト証跡

- 画像: `docs/design/concepts/hana-quiet-heirloom-concept-2026-07-23.png`
- 状態: mood evidence only
- 用途: visual direction, tone, density, hierarchy, material feel の参照
- 禁止: 画像内の日本語文言をそのまま本番 UI copy として採用しない

生成画像は実装正本ではない。特に日本語 copy、AI 同意文言、privacy claim は
このリポジトリの copy ledger、ADR、privacy evidence、human review を優先する。
画像に trust / privacy / AI 送信に関する文言が見える場合、その文言は unsafe draft として扱い、
active UI や PR evidence に転記しない。

## 正本の優先順位

`ISSUE-053` 以降のデザイン刷新では、次の順で衝突を解決する。

| 優先 | source                                                                                                               | 役割                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1    | `docs/design/ai-consent-privacy-evidence.md`, `docs/design/delete-restore-trust-contract.md`, ADR, human review gate | privacy / trust / legal claims           |
| 2    | `Hana_PRD_v1.md`                                                                                                     | product value and MVP success target     |
| 3    | `docs/design/design-evaluation-rubric.md`                                                                            | Go / Hold / No-Go judgment               |
| 4    | `docs/design/quiet-heirloom-design-canon.md`                                                                         | visual and interaction direction         |
| 5    | `docs/design/lp-app-visual-grammar.md`                                                                               | LP / app visual parity and icon language |
| 6    | `docs/design/v0-prompt.md`                                                                                           | older screen reference                   |
| 7    | generated images and `docs/design/v0-output/`                                                                        | non-authoritative mood / example         |

V0 prompt や生成画像が privacy / trust evidence と衝突する場合は、常に privacy / trust evidence を優先する。

## デザイン原則

| 原則                 | 意味                                                | 実装判断                                                     |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Album not feed       | 公開 SNS ではなく、閉じた私的アルバム               | ranking、like count、streak、feed density を避ける           |
| Whisper not shout    | 行動を急かさず、戻ってきやすくする                  | 強いバナー、派手な badge、罪悪感 copy を避ける               |
| Bottom-Sheet Capture | 記録は下から進む 30 秒 flow                         | primary CTA は mobile thumb zone に置く                      |
| AI is quiet          | AI は記録の黒子。魔法演出にしない                   | AI 同意は明示し、保存後に AI ラベルを押し出さない            |
| Folded Keepsake      | card ではなく、紙片、写真台紙、保管された記憶の質感 | 影と境界は薄く、写真と本文を主役にする                       |
| Forgiving by default | 空白、失敗、復帰、キャンセルで親を責めない          | 未記録日、連続記録、失敗回数を圧として表示しない             |
| Trust before delight | 写真、AI、削除、共有で安心を先に置く                | 不確かな retention / restore promise は active UI に出さない |

## ビジュアル方針

| 要素         | ルール                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Canvas       | warm washi base。画面全体を淡い紙の余白として扱う                       |
| Surface      | white / porcelain を基調に、浮かせすぎない                              |
| Accent       | sakura は装飾、しるし、小さな感情アクセントに限定し、画面全体を染めない |
| Primary      | sage は記録、保存、完了、主要導線に使う                                 |
| Secondary    | warm umber は補助状態や quiet affordance に使う                         |
| Hairline     | dividers と photo mat に使う。濃い罫線で囲い込まない                    |
| Shadow       | soft / shallow。glassmorphism や SaaS 風の強い elevation は使わない     |
| Radius       | 既存 Hana token を尊重しつつ、紙片と写真台紙で意味を分ける              |
| Typography   | UI は読みやすく、物語本文と見出しは serif で静かに読ませる              |
| Illustration | 装飾目的の baby sticker や generic pastel illustration は避ける         |

## ISSUE-066 Refinement Contract

`ISSUE-066` 以降は、コンセプト画像を「コピー対象」ではなく「質感の基準」として扱う。
現状の Hana は Quiet Heirloom の方向には合っているが、まだ「写真と素材が主役」より
「よく整ったカード UI」に見える箇所がある。以降の修正では、機能を増やすよりも、
紙、写真台紙、細線、余白、sage の記録導線へ主役を渡す。

### Color Semantics

| token family       | 意味                               | 主な用途                                                             | 禁止                                      |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| sage / leaf        | 記録・保存・完了                   | primary CTA、save done、bottom navigation の active / central action | 長文 helper text の低 contrast 表示       |
| sakura             | 装飾・しるし・小さな感情アクセント | favorite、focus ring、pressed flower ornament、小さな brand accent   | 大きな面の CTA、画面全体の tint、本文色   |
| warm umber / amber | 注意・補助状態                     | warning、destructive-but-calm copy、quiet affordance                 | emergency red の代用として強く煽る表現    |
| ink                | 読むための主役                     | title、body、metadata、trust copy                                    | contrast を下げて雰囲気だけを優先すること |

### Material And Radius Taxonomy

| surface       | radius 目安 | 境界 / 影                               | 用途                                     |
| ------------- | ----------- | --------------------------------------- | ---------------------------------------- |
| photo-inner   | 10-12px     | image 自体。影なし                      | 写真の内側角丸                           |
| photo-mat     | 14-16px     | hairline + 余白                         | 写真台紙、placeholder、thumbnail         |
| paper-slip    | 16-20px     | hairline + shadow-soft または影なし     | 保管された小さな紙片、説明の最小 surface |
| sheet         | 20-24px     | top hairline + 必要最小限の shadow-lift | 記録 bottom sheet、toast、dialog         |
| pill / circle | full        | control としてのみ                      | CTA、icon button、tab action             |

arbitrary `rounded-[...]` は、この表に合う場合だけ使う。大きい角丸を足して
「かわいい」方向に寄せるのではなく、写真と本文の邪魔をしない薄い紙感を優先する。

### Shadow And Hairline

- 通常 card / paper-slip は hairline と余白で分ける
- `shadow-lift` は bottom sheet、toast、dialog など一時的に前面へ出る要素に限定する
- navigation は強い浮遊感より、薄い hairline と safe area の安定感を優先する
- glassmorphism、濃い drop shadow、SaaS dashboard 風 elevation は使わない

### Ornament Rules

pressed flower / paper fiber のような装飾は、次の条件をすべて満たす場合だけ許可する。

- `aria-hidden` で、操作対象や情報伝達の主役にしない
- 小さく、低 opacity で、本文や写真を覆わない
- baby sticker、generic pastel illustration、実写真風の人物素材にしない
- privacy / trust / AI 同意の説明を装飾で曖昧にしない
- PR evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

### LP-App Visual Grammar

LP や参照画像と本体アプリの見え方を揃えるときは、`docs/design/lp-app-visual-grammar.md`
を追加の橋渡し正本として読む。ISSUE-076 以降の判断では、次を固定する。

- 色 token を大きく変える前に、`PhotoMat`、`PaperSlip`、`QuietIcon`、`QuietIconButton`
  など意味を持つ primitive 化を優先する
- lucide icon を標準とし、通常操作の stroke は 1.75 前後、active は 1.9 前後にそろえる
- fill を許可する操作 icon は favorite の `Heart` だけに限定する
- `Sparkles` / `WandSparkles` のような AI 主役 icon は避け、必要なら `PenLine` / `FileText` にする
- product app icon、wordmark、pressed flower / knot divider 以外の custom icon を操作に使わない
- LP の product preview は、古い理想図ではなく現行 app QA artifact と同期していることを release gate で確認する

### Screen-Level Refinement Direction

| screen        | 現状のズレ                                                                   | refinement                                                                |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Home          | 説明カードが先に立ち、写真や素材の気配が弱い                                 | first view で写真または photo mat を主役にし、CTA と stats は静かに支える |
| Record        | 構造は近いが、AI / title / date / weather が同じ密度で並ぶとフォーム感が出る | 写真未選択、下書き、保存確認を 1 判断ずつ見せ、詳細編集は低密度に残す     |
| Album         | 縦リストは実用的だが、private shelf の余白が弱い                             | featured page / large keepsake preview を置き、多件数一覧は下に残す       |
| Memory Detail | 写真と本文は強い。操作帯と保存直後 notice が少し card 的                     | action を控えめにし、保存直後は安心して読み返せる状態を優先する           |
| Settings      | trust surface として密度が高い                                               | 正確さを保ちつつ、概要と詳細を分け、未実装の約束を増やさない              |

## 画面別ルール

## 30秒計測ルール

Hana の 30 秒記録は、実装後に次の条件で測る。

| パス                       | 計測開始                                      | 計測終了                            | 目標                                           |
| -------------------------- | --------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| core AI path               | 既存同意済みユーザーが写真 1 枚を選択した時点 | 保存完了 feedback または album 遷移 | 30 秒以内。30〜60 秒は warning、60 秒超は Hold |
| first consent path         | AI 同意 dialog が表示された時点               | 同意または skip 後に保存可能な状態  | 60 秒以内。信頼説明を短縮して隠してはいけない  |
| AI skip / manual save path | 写真 1 枚を選択した時点                       | 保存完了 feedback または album 遷移 | 30 秒以内                                      |
| failure recovery path      | upload / AI / save failure が表示された時点   | 入力を失わず retry できる状態       | 完了秒数より復帰可能性を優先                   |

OS の写真 picker、認証、初回 onboarding、ネットワーク障害そのものは core 30 秒から除外する。
ただし、UI が待ち時間の不安を増やしていないかは `ISSUE-059` で別途確認する。
AI が本文を提案する体験は中核価値であり、secondary なのは本文の手動編集、天気、日付の調整である。

### ホーム

- 主役は「記録する圧」ではなく「戻ってこられる場所」
- recent memories は横並び feed ではなく、保管された小さなページとして見せる
- empty state は初回記録へ自然につなぐ
- stats は達成圧や比較に見せない。表示する日数は「連続記録」ではなく「一緒に過ごした日数」として扱う

### 記録

- 画面上部は写真または選択前の余白、画面下部は現在の action に集中する
- primary CTA は常に下部 35% に置く
- 必須は photo / title / save。AI 生成本文は中核価値で、本文の手動編集、weather、date は secondary として扱う
- AI は opt-in。AI を使わなくても保存できる
- upload / AI / save failure は入力を失わせない
- keyboard open、safe area、focus order、input occlusion を実装 PR で確認する

### アルバム

- 一覧は public gallery ではなく private shelf として見せる
- thumbnail は写真台紙のように扱い、詰め込みすぎない
- load more は静かに、かつ多件数でも不安にならない位置に置く
- favorite は ranking ではなく個人的な印として扱う

### 記録詳細

- 写真と物語本文が主役
- metadata と action は控えめに置く
- delete copy は既存 trust contract を維持し、復元を過剰約束しない
- photo alt は `docs/design/photo-alt-privacy-policy.md` を正とする

### 設定

- trust surface として扱う
- AI 同意状態、送るもの / 送らないもの、削除、export、家族共有の将来項目は、
  実装済みか future かを曖昧にしない

## 文言ルール

| 使ってよい方向                           | 禁止する方向                                    |
| ---------------------------------------- | ----------------------------------------------- |
| 「ひとことだけでも」「あとでなおせます」 | 「毎日続けましょう」「記録が途切れました」      |
| 「うまくいかなかったので、もう一度」     | HTTP status や internal reason をそのまま見せる |
| 「AI を使わずに残す」                    | AI 利用を隠す、同意を曖昧にする                 |
| 「アルバムから見えなくなります」         | 未実装の復元や完全削除を active UI で約束する   |
| synthetic name のみを例示に使う          | 実名、メール、生年月日、画像 URL、storage_key   |

AI の「送るもの / 送らないもの」は `docs/design/ai-consent-privacy-evidence.md` を正とする。
生成画像、古い V0 prompt、PR コメントから転記しない。

## モーションルール

- motion は「できたことを静かに知らせる」ために使う
- AI waiting は派手な魔法演出にしない
- save success は短く、reduced motion でも同じ意味が伝わる
- `prefers-reduced-motion` を必ず尊重する

## 実装順序

| 順番 | issue       | 対象                                 | 理由                                       |
| ---- | ----------- | ------------------------------------ | ------------------------------------------ |
| 1    | `ISSUE-054` | design token and common UI refresh   | 各画面で雰囲気がばらける前に土台を固定する |
| 2    | `ISSUE-058` | state copy and quiet motion system   | 画面別実装前に copy / motion ledger を置く |
| 3    | `ISSUE-055` | record bottom-sheet capture redesign | MVP の中核である 30 秒記録を成立させる     |
| 4    | `ISSUE-056` | home Quiet Heirloom refresh          | 記録入口と復帰体験を整える                 |
| 5    | `ISSUE-057` | album and memory keepsake refresh    | 見返す体験を private album として磨く      |
| 6    | `ISSUE-059` | design mobile QA and review gate     | 画面刷新全体を release gate として確認する |

## Refinement Implementation Sequence

`ISSUE-066` 以降は、上記 rebuild が終わった後の精度上げとして進める。
OpenAPI / DB / 認証 / Storage 変更は含めない。1 Issue 1 PR を守り、
後続 Issue は `ISSUE-066` の設計契約と evidence policy に従う。

| 順番 | issue       | 対象                                           | 依存        |
| ---- | ----------- | ---------------------------------------------- | ----------- |
| 1    | `ISSUE-066` | refinement 設計契約と QA 観点の固定            | なし        |
| 2    | `ISSUE-067` | token / common UI の sage・radius・shadow 調整 | `ISSUE-066` |
| 3    | `ISSUE-068` | home first view を写真 / photo mat 主役へ調整  | `ISSUE-067` |
| 4    | `ISSUE-069` | record を 1 判断ずつの bottom sheet へ調整     | `ISSUE-067` |
| 5    | `ISSUE-070` | album / memory detail を private shelf へ調整  | `ISSUE-067` |
| 6    | `ISSUE-076` | LP / 参照画像の視覚語彙を app 実装契約へ翻訳   | なし        |

`ISSUE-068` から `ISSUE-070` は並行可能に見えるが、色・角丸・影の意味が
`ISSUE-067` で固まってから着手する。視覚差分のレビューでは、好みではなく
「写真が主役か」「30 秒記録が弱くなっていないか」「trust claim を増やしていないか」で判断する。
`ISSUE-076` 以降は LP で強まった `photo mat + paper slip + sage pill + quiet icon` の語彙を
本体アプリに戻すため、共通 primitive と QA gate を先に置いてから画面別実装を進める。

## サブエージェントレビュー

各実装 PR は最大 3 回まで、次の 3 方向で read-only review を実施する。

| レビュアー                       | ゲート                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| Product UX / 30秒記録            | Task Success 4 以上。Happiness / Retention を圧で作っていない     |
| Privacy / Trust / Content Safety | Privacy Trust 4 以上。PII、画像 URL、storage_key、AI 本文露出なし |
| Visual / A11y / Engineering      | Accessibility 3 以上。mobile、contrast、focus、実装粒度が成立     |

blocker が残る場合は merge しない。warning は follow-up Issue に残せるが、
Privacy Trust、Content Safety、Accessibility、Task Success の No-Go は平均点で相殺しない。

## 証跡ポリシー

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、storage_key、prompt、AI 生成本文を残さない
- screenshot は synthetic / local data のみ
- child name が必要な例示は `はな` / `あお` に限定する
- AI 生成品質は本文全文ではなく、分類、違和感、rubric score で残す
- PR body には evidence policy の確認結果を書く
