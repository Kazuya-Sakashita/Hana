# Hana Quiet Heirloom Design Canon

この文書は `ISSUE-053` の成果物として、Hana の大幅デザイン見直しで採用する方向性を固定する。
実装時は `Hana_PRD_v1.md`、`docs/design/design-evaluation-rubric.md`、
`docs/design/design-inventory-roadmap.md`、`docs/design/ai-consent-privacy-evidence.md`、
`docs/design/photo-alt-privacy-policy.md`、`docs/design/delete-restore-trust-contract.md` と合わせて読む。

## Decision

Hana の次の UI 方向性は **Quiet Heirloom** とする。

親に「毎日ちゃんと記録しよう」と迫るアプリではなく、
写真 1 枚をきっかけに、小さな記憶を静かに残せる私的なアルバムとして設計する。
AI は主役ではなく、言葉が出ない時だけそっと下書きする黒子として扱う。

## Concept Evidence

- Image: `docs/design/concepts/hana-quiet-heirloom-concept-2026-07-23.png`
- Status: mood evidence only
- Use: visual direction, tone, density, hierarchy, material feel の参照
- Do not use: 画像内の日本語文言をそのまま本番 UI copy として採用しない

生成画像は実装正本ではない。特に日本語 copy、AI 同意文言、privacy claim は
このリポジトリの copy ledger、ADR、privacy evidence、human review を優先する。
画像に trust / privacy / AI 送信に関する文言が見える場合、その文言は unsafe draft として扱い、
active UI や PR evidence に転記しない。

## Source-Of-Truth Precedence

`ISSUE-053` 以降の design rebuild では、次の順で衝突を解決する。

| priority | source                                                                                                               | role                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1        | `docs/design/ai-consent-privacy-evidence.md`, `docs/design/delete-restore-trust-contract.md`, ADR, human review gate | privacy / trust / legal claims       |
| 2        | `Hana_PRD_v1.md`                                                                                                     | product value and MVP success target |
| 3        | `docs/design/design-evaluation-rubric.md`                                                                            | Go / Hold / No-Go judgment           |
| 4        | `docs/design/quiet-heirloom-design-canon.md`                                                                         | visual and interaction direction     |
| 5        | `docs/design/v0-prompt.md`                                                                                           | older screen reference               |
| 6        | generated images and `docs/design/v0-output/`                                                                        | non-authoritative mood / example     |

V0 prompt や生成画像が privacy / trust evidence と衝突する場合は、常に privacy / trust evidence を優先する。

## Design Principles

| principle            | 意味                                                | 実装判断                                                     |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Album not feed       | 公開 SNS ではなく、閉じた私的アルバム               | ranking、like count、streak、feed density を避ける           |
| Whisper not shout    | 行動を急かさず、戻ってきやすくする                  | 強いバナー、派手な badge、罪悪感 copy を避ける               |
| Bottom-Sheet Capture | 記録は下から進む 30 秒 flow                         | primary CTA は mobile thumb zone に置く                      |
| AI is quiet          | AI は記録の黒子。魔法演出にしない                   | AI 同意は明示し、保存後に AI ラベルを押し出さない            |
| Folded Keepsake      | card ではなく、紙片、写真台紙、保管された記憶の質感 | 影と境界は薄く、写真と本文を主役にする                       |
| Forgiving by default | 空白、失敗、復帰、キャンセルで親を責めない          | 未記録日、連続記録、失敗回数を圧として表示しない             |
| Trust before delight | 写真、AI、削除、共有で安心を先に置く                | 不確かな retention / restore promise は active UI に出さない |

## Visual Direction

| element      | rule                                                                |
| ------------ | ------------------------------------------------------------------- |
| Canvas       | warm washi base。画面全体を淡い紙の余白として扱う                   |
| Surface      | white / porcelain を基調に、浮かせすぎない                          |
| Accent       | sakura は CTA や small highlight に限定し、画面全体を染めない       |
| Secondary    | sage / warm umber は状態や quiet affordance に使う                  |
| Hairline     | dividers と photo mat に使う。濃い罫線で囲い込まない                |
| Shadow       | soft / shallow。glassmorphism や SaaS 風の強い elevation は使わない |
| Radius       | 既存 Hana token を尊重しつつ、紙片と写真台紙で意味を分ける          |
| Typography   | UI は読みやすく、物語本文と見出しは serif で静かに読ませる          |
| Illustration | 装飾目的の baby sticker や generic pastel illustration は避ける     |

## Screen Rules

## 30-Second Measurement Contract

Hana の 30 秒記録は、実装後に次の条件で測る。

| path                       | start                                         | finish                              | target                                         |
| -------------------------- | --------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| core AI path               | 既存同意済みユーザーが写真 1 枚を選択した時点 | 保存完了 feedback または album 遷移 | 30 秒以内。30〜60 秒は warning、60 秒超は Hold |
| first consent path         | AI 同意 dialog が表示された時点               | 同意または skip 後に保存可能な状態  | 60 秒以内。信頼説明を短縮して隠してはいけない  |
| AI skip / manual save path | 写真 1 枚を選択した時点                       | 保存完了 feedback または album 遷移 | 30 秒以内                                      |
| failure recovery path      | upload / AI / save failure が表示された時点   | 入力を失わず retry できる状態       | 完了秒数より復帰可能性を優先                   |

OS の写真 picker、認証、初回 onboarding、ネットワーク障害そのものは core 30 秒から除外する。
ただし、UI が待ち時間の不安を増やしていないかは `ISSUE-059` で別途確認する。
AI が本文を提案する体験は中核価値であり、secondary なのは本文の手動編集、天気、日付の調整である。

### Home

- 主役は「記録する圧」ではなく「戻ってこられる場所」
- recent memories は横並び feed ではなく、保管された小さなページとして見せる
- empty state は初回記録へ自然につなぐ
- stats は達成圧や比較に見せない。表示する日数は「連続記録」ではなく「一緒に過ごした日数」として扱う

### Record

- 画面上部は写真または選択前の余白、画面下部は現在の action に集中する
- primary CTA は常に下部 35% に置く
- 必須は photo / title / save。AI 生成本文は中核価値で、本文の手動編集、weather、date は secondary として扱う
- AI は opt-in。AI を使わなくても保存できる
- upload / AI / save failure は入力を失わせない
- keyboard open、safe area、focus order、input occlusion を実装 PR で確認する

### Album

- 一覧は public gallery ではなく private shelf として見せる
- thumbnail は写真台紙のように扱い、詰め込みすぎない
- load more は静かに、かつ多件数でも不安にならない位置に置く
- favorite は ranking ではなく個人的な印として扱う

### Memory Detail

- 写真と物語本文が主役
- metadata と action は控えめに置く
- delete copy は既存 trust contract を維持し、復元を過剰約束しない
- photo alt は `docs/design/photo-alt-privacy-policy.md` を正とする

### Settings

- trust surface として扱う
- AI 同意状態、送るもの / 送らないもの、削除、export、家族共有の将来項目は、
  実装済みか future かを曖昧にしない

## Copy Rules

| Do                                       | Do not                                          |
| ---------------------------------------- | ----------------------------------------------- |
| 「ひとことだけでも」「あとでなおせます」 | 「毎日続けましょう」「記録が途切れました」      |
| 「うまくいかなかったので、もう一度」     | HTTP status や internal reason をそのまま見せる |
| 「AI を使わずに残す」                    | AI 利用を隠す、同意を曖昧にする                 |
| 「アルバムから見えなくなります」         | 未実装の復元や完全削除を active UI で約束する   |
| synthetic name のみを例示に使う          | 実名、メール、生年月日、画像 URL、storage_key   |

AI の「送るもの / 送らないもの」は `docs/design/ai-consent-privacy-evidence.md` を正とする。
生成画像、古い V0 prompt、PR コメントから転記しない。

## Motion Rules

- motion は「できたことを静かに知らせる」ために使う
- AI waiting は派手な魔法演出にしない
- save success は短く、reduced motion でも同じ意味が伝わる
- `prefers-reduced-motion` を必ず尊重する

## Implementation Order

| order | issue       | target                               | reason                                     |
| ----- | ----------- | ------------------------------------ | ------------------------------------------ |
| 1     | `ISSUE-054` | design token and common UI refresh   | 各画面で雰囲気がばらける前に土台を固定する |
| 2     | `ISSUE-058` | state copy and quiet motion system   | 画面別実装前に copy / motion ledger を置く |
| 3     | `ISSUE-055` | record bottom-sheet capture redesign | MVP の中核である 30 秒記録を成立させる     |
| 4     | `ISSUE-056` | home Quiet Heirloom refresh          | 記録入口と復帰体験を整える                 |
| 5     | `ISSUE-057` | album and memory keepsake refresh    | 見返す体験を private album として磨く      |
| 6     | `ISSUE-059` | design mobile QA and review gate     | 画面刷新全体を release gate として確認する |

## Subagent Review Loop

各実装 PR は最大 3 回まで、次の 3 方向で read-only review を実施する。

| reviewer                         | gate                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| Product UX / 30秒記録            | Task Success 4 以上。Happiness / Retention を圧で作っていない     |
| Privacy / Trust / Content Safety | Privacy Trust 4 以上。PII、画像 URL、storage_key、AI 本文露出なし |
| Visual / A11y / Engineering      | Accessibility 3 以上。mobile、contrast、focus、実装粒度が成立     |

blocker が残る場合は merge しない。warning は follow-up Issue に残せるが、
Privacy Trust、Content Safety、Accessibility、Task Success の No-Go は平均点で相殺しない。

## Evidence Policy

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、storage_key、prompt、AI 生成本文を残さない
- screenshot は synthetic / local data のみ
- child name が必要な例示は `はな` / `あお` に限定する
- AI 生成品質は本文全文ではなく、分類、違和感、rubric score で残す
- PR body には evidence policy の確認結果を書く
