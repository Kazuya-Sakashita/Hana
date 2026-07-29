---
title: LP-App Visual Parity QA
last_updated: 2026-07-25
owner: kazuya
issue: ISSUE-082
requires_human_review:
  - design
  - accessibility
  - privacy
---

# LP-App Visual Parity QA

この文書は、LP と本体アプリが同じ Hana に見えることを継続確認するための QA gate である。
`docs/design/lp-app-visual-grammar.md` で定義した
`photo mat + paper slip + sage pill + quiet icon` を、主要画面と公開前 LP の両方で守る。

## Gate Policy

| gate            | Go 条件                                                                                                                 | Hold 条件                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| token parity    | canvas / paper-slip / photo-mat / ink / sage / sakura / radius の意図が LP と app で接続されている                      | 差分理由のない token drift                                 |
| surface parity  | Home は写真台紙、Record は写真 + 下部 sheet、Album は private shelf、Memory Detail は写真と本文が action より先に読める | generic card / dashboard / feed の印象が戻る               |
| icon parity     | 操作 icon は lucide + `QuietIcon` / `QuietIconButton` の語彙に沿う                                                      | custom 操作 icon、文字 glyph、default stroke 2 が増える    |
| CTA parity      | 記録、保存、完了、待機リストは sage pill として落ち着いて見える                                                         | sakura の大面積 CTA、強い shadow、浮きすぎた FAB           |
| accessibility   | interactive target は 44px 以上、primary CTA は 48px 以上、active state は色だけに依存しない                            | 小さな text button、focus clipped、色だけの active state   |
| contrast        | body text は 7:1 目標、helper / status text は 4.5:1 以上、focus indicator / non-text UI は 3:1 以上                    | sakura / leaf の小文字 text を比率未確認で使う             |
| evidence safety | screenshot / manifest / PR body に PII、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールがない          | いずれかが証跡に残る                                       |
| trust copy      | vendor retention、ZDR、完全削除、復元可能、Store 導線、未実装 OAuth を断定しない                                        | visual score で privacy / legal blocker を相殺しようとする |

## Screenshot Matrix

CI contract は artifact を書き込まない。実機または app-backed QA で画像確認する場合は、下記を
synthetic data のみで見る。

| 対象                            | 状態                                                                                | Viewports                            |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| LP                              | hero、Before / After、product preview、trust / final CTA                            | 390x844、430x932、768x1024、1280x900 |
| Home                            | empty、1 memory、5 memories、long child name                                        | 390x640、390x844、430x932、768x1024  |
| Record                          | empty、photo selected、AI consent、generating、manual save ready、save ready、error | 390x640、390x844、430x932            |
| Album                           | all-empty、month-empty、1 memory、long title / body、load more / end                | 390x844、430x932、768x1024           |
| Memory Detail                   | saved notice、normal、long body、additional photos                                  | 390x844、430x932                     |
| Sign-in / Onboarding / Settings | auth entry、first-memory bridge、trust surface                                      | 390x844、430x932                     |

## CI Contract

実行コマンド:

```bash
pnpm qa:issue082:lp-app-visual-parity -- --mode=contract
```

contract mode は read-only で、スクリーンショット、accessibility snapshot、manifest、
QA evidence file を保存しない。確認するのは次の契約に限定する。

- LP artifact と LP image evidence が存在する
- `lp-app-visual-grammar.md` / `product-design-qa-v2.md` / 本文書が `ISSUE-082` を参照する
- Home / Record / Album / Memory Detail / Sign-in / Onboarding / Settings に、LP-App visual grammar の橋渡しとなる test id や primitive が残っている
- `PhotoMat`, `PaperSlip`, `TrustSection`, `QuietIcon`, `QuietIconButton` が共通 primitive として存在する
- active UI source に vendor retention、ZDR、完全削除、復元可能、Store CTA、未実装 OAuth などの未確認 claim が増えていない
- 出力 JSON は route id、file id、check 名、matrix 名だけを持ち、本文・画像 URL・メール・AI 生成本文を保存しない

## Evaluation Framework

専門レビューは次の 5 軸を `Go / Hold / No-Go` で見る。平均点ではなく、No-Go が 1 つでもあれば
修正対象とする。

| axis                 | 見ること                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Concept fit          | 参照画像の quiet / heirloom / private shelf の雰囲気に寄っているか       |
| Visual system        | token、surface、icon、CTA、radius、shadow が画面間で揃っているか         |
| Product task clarity | 30 秒記録、待機リスト、保存、読み返しの主行動が迷わず見えるか            |
| Accessibility        | contrast、tap target、focus、active state、long text で破綻しないか      |
| Trust safety         | 公開前検証として言えることだけを書き、privacy / legal claim を盛らないか |

## Evidence Policy

- 実写真、子ども / 親の実名、生年月日、メール、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さない
- QA 用の child name は `はな` / `あお` など synthetic name に限定する
- 参照画像は mood evidence として扱い、画像内の copy / trust claim を本番 UI に転記しない
- Privacy Trust / Content Safety / Accessibility / Task Success の No-Go は visual score で相殺しない
- 人間の privacy / legal review が必要な公開 claim は、この gate では Go にしない
