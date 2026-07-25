# Hana 現行デザイン LP 化レビュー

作成日: 2026-07-25

## 対象

- LP prototype: `docs/design/artifacts/current-lp/index.html`
- Visual asset: `docs/design/artifacts/current-lp/hana-quiet-heirloom-concept-lp.webp`
- 参照正本:
  - `Hana_PRD_v1.md`
  - `docs/design/quiet-heirloom-design-canon.md`
  - `docs/design/ai-consent-privacy-evidence.md`
  - `docs/design/design-inventory-roadmap.md`

この artifact は現行 Hana の Quiet Heirloom 方向性を LP として確認するための静的プロトタイプ。
実ユーザー写真、実名、メール、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文は含めない。

## 今回反映した改善

| 項目        | 反映内容                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| LP 化       | Hero、Before / After、30秒 flow、product preview、trust、final CTA を持つ静的 HTML を作成                |
| CV 導線     | CTA をページ内説明リンクから、リリース通知 / Store 準備導線へ変更                                        |
| 記録価値    | ISSUE-073 で synthetic safe asset と `写真のみ → 写真 + title → 写真 + 短い本文` の3段 proof を追加      |
| Hero 構図   | ISSUE-074 で 2 台の phone mock を削り、Hero の主役を単一の keepsake preview に整理                       |
| AI 同意     | `同意していれば下書きを待つ` とし、AI を使わず保存できることを flow と trust に明示                      |
| Trust copy  | 保持期間、学習利用、削除保証などの未確認 claim は断定しない構成に調整                                    |
| A11y        | H1 1つ、decorative image の空 alt、gallery alt、focus-visible、reduced motion、viewport、44px 対応を確認 |
| Performance | 1.9MB PNG 参照を LP 用 WebP 約58KBへ差し替え                                                             |

## 専門家サブエージェント評価

5名の read-only レビューを実施した。全員、編集は行っていない。

| Reviewer                 | Framework                              | Verdict        | 主な指摘                                                                               |
| ------------------------ | -------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| Product UX / HEART       | HEART + JTBD                           | Hold           | 情緒と JTBD は合う。ISSUE-073 で Before / After 証拠は改善、Adoption CTA は未解決      |
| Brand / Conversion       | LIFT + AIDA                            | Hold           | Brand は Go 寄り。Action と Desire が低く、Store / 待機リスト導線が必要                |
| Visual Art Direction     | Quiet Heirloom + AI slop blacklist     | Conditional Go | ISSUE-074 で Hero の主役を単一の keepsake preview に整理。公開前に実ブラウザ QA は必要 |
| Accessibility / Frontend | WCAG 2.2 AA + Nielsen                  | Conditional Go | 構造は良い。公開前に実ブラウザで touch target、mobile nav、画像 payload を確認         |
| Privacy / Trust          | Trust before delight + evidence policy | Conditional Go | 内部 artifact としては可。公開前に AI 同意、送る/送らない説明、claim を人間レビュー    |

## フレームワーク別スコア

| Framework       |   Score | 判定           | 補足                                             |
| --------------- | ------: | -------------- | ------------------------------------------------ |
| HEART / JTBD    | 3.5 / 5 | Hold           | Happiness と JTBD は強いが、Adoption が弱い      |
| LIFT / AIDA     | 3.0 / 5 | Hold           | Attention は強いが、Action と Desire が未完成    |
| Quiet Heirloom  | 4.2 / 5 | Conditional Go | Hero composition は改善。実ブラウザ QA は未完    |
| WCAG / Nielsen  | 4.0 / 5 | Conditional Go | 静的検査は良い。実ブラウザ QA は未完             |
| Privacy / Trust | 4.0 / 5 | Conditional Go | 危険な断定は回避。公開 copy は最終レビューが必要 |

総合判定: **内部デザイン検討 artifact としては Conditional Go。公開 LP としては Hold。**

## 完成度を上げる課題

### P0

| ID       | 課題                                   | Why                                                                                            | 完了条件                                                                                                                               |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| LP-P0-01 | 実行可能な CV 導線を設計する           | 静的 prototype の Store 準備表示だけでは、LP 目的の DL / 事前登録検証にならない                | App Store / Google Play URL、待機リスト、または通知フォームのいずれかを決め、CTA が自己リンクで終わらない                              |
| LP-P0-02 | Before / After を本物の価値証拠にする  | PRD は「写真のみ → 写真＋文章」で差別化を見せる前提。写真のみとの差分を 3 秒で見せる必要がある | 対応済み。ISSUE-073 で synthetic safe asset と、人間レビュー済み synthetic 例を `写真のみ → 写真 + title → 写真 + 短い本文` として追加 |
| LP-P0-03 | Public trust copy の人間レビューを通す | AI、保持、学習、削除 claim は信頼を左右する。未確認の断定は No-Go                              | `ai-consent-privacy-evidence.md` と privacy/legal review に照らし、公開してよい文言だけにする                                          |

### P1

| ID       | 課題                                              | Why                                                                                    | 完了条件                                                                                                           |
| -------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| LP-P1-01 | Hero composition を 1 strong visual anchor に絞る | 背景、Hana、phone mock、CTA、trust row が同時に立ち、Quiet Heirloom の静けさが薄まる   | 対応済み。ISSUE-074 で Hero の主役を単一の keepsake preview に整理し、phone mock と hero 内 trust row の競合を削除 |
| LP-P1-02 | 「書けない親」の痛みを first view に少し上げる    | Brand は美しいが、忙しい親が「自分のことだ」と感じる Relevance が弱い                  | 寝かしつけ後、疲れている、でも忘れたくない、を短い支持文で伝える                                                   |
| LP-P1-03 | 実ブラウザ QA を行う                              | 静的検査は通ったが、重なり、折返し、focus order、touch target はレンダリング確認が必要 | 390 / 430 / 768 / 1280px でスクリーンショット、横 overflow、focus、contrast、LCP 目安を確認                        |
| LP-P1-04 | 画像 asset を公開用に作る                         | 既存 concept image は mood evidence で、画像内コピーを正本にしない方針                 | 文字なし、実写真なし、Hana らしい photo mat / keepsake asset を用意する                                            |
| LP-P1-05 | Trust 詳細への導線を設計する                      | 安心材料はあるが、詳しく確認する場所が LP から見えない                                 | AI 同意、送る/送らない、削除、共有の説明へ進める導線を決める                                                       |

### P2

| ID       | 課題                               | Why                                                                 | 完了条件                                                               |
| -------- | ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| LP-P2-01 | 表記ゆれを整える                   | 「写真 / しゃしん」「1まい / 1枚」などが混ざると premium 感が落ちる | LP copy の表記ルールを決め、意図のある箇所以外を統一                   |
| LP-P2-02 | 紙片と card の境界をさらに詰める   | まだ一部が整ったカード UI に見える                                  | shadow、radius、hairline を調整し、photo mat / paper slip の質感を優先 |
| LP-P2-03 | 公開版から artifact 文言を取り除く | 静的 prototype 表記は内部レビューには有用だが、公開 LP には不要     | footer と meta copy を公開向け文言に置換                               |

## 次の推奨順

1. `LP-P0-01` と `LP-P0-02` を先に詰める。LP の目的が CV と価値証拠だから。
2. `LP-P0-03` を人間レビュー gate にする。Trust は visual score で相殺しない。
3. `LP-P1-01` は ISSUE-074 で対応済み。公開に近づける段階で実ブラウザ QA と trust human review を通す。
4. 公開に近づける段階で `LP-P1-03` の実ブラウザ QA を必ず通す。
