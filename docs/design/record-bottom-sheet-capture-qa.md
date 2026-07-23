# ISSUE-055 記録画面 Bottom-Sheet Capture QA

この文書は `ISSUE-055` の PR 証跡として、30 秒記録の計測条件、今回確認した結果、
および evidence safety の扱いを残す。実ユーザーの写真、名前、メール、生年月日、画像 URL、
storage_key、prompt、AI 生成本文は残さない。

## 対象

- 画面: `/record`
- 変更範囲: 写真選択、アップロード状態、AI 下書き、手動入力、保存 CTA の情報設計
- 対象外: API、DB、Storage、AI payload、AI prompt、album/detail の visual redesign

## 30 秒計測条件と今回結果

| パス                       | 計測開始                                      | 計測終了                            | 今回結果                                         |
| -------------------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| core AI path               | 既存同意済みユーザーが写真 1 枚を選択した時点 | 保存完了 feedback または album 遷移 | Synthetic stopwatch pass: 2579ms / 30s           |
| AI skip / manual save path | 写真 1 枚を選択した時点                       | 保存完了 feedback または album 遷移 | Synthetic stopwatch pass: 1291ms / 30s           |
| first consent path         | AI 同意 dialog が表示された時点               | 同意または skip 後に保存可能な状態  | Synthetic stopwatch pass: 1805ms / 60s           |
| failure recovery path      | upload / AI / save failure が表示された時点   | 入力を失わず retry できる状態       | Static pass。同一写真 retry と role alert を維持 |

`ISSUE-055` では UI 構造、状態復帰、synthetic stopwatch の前提を確認する。
認証済み実データを使った実機 stopwatch は行わない。実機ブラウザの最終確認は
`ISSUE-059` の mobile QA release gate で synthetic data のみを使って再確認する。

## Synthetic Stopwatch Setup

- 端末条件: mobile viewport `390x844`、portrait、reduced motion no-preference。
- データ条件: child name は `はな`、写真は synthetic 1x1 image、API は mocked success / failure。
- core AI path: upload confirm 300ms、AI generate 1200ms、memory create 300ms の mocked latency。
- AI skip / manual save path: upload confirm 300ms、memory create 300ms の mocked latency。
- first consent path: AI consent dialog 表示から accept または `AI を つかわない` までを計測開始にする。
- 保存完了の終点: success toast または `/album` 遷移検知。
- 実行コマンド:
  `CODEX_RUNTIME_NODE_MODULES=/Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 /Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/qa/issue-055-record-stopwatch.cjs`
- 実行結果: `core AI path=2579ms`、`AI skip / manual save path=1291ms`、`first consent path=1805ms`。

## Static Verification

- Bottom sheet は `sticky bottom-0`、`max-h-[68dvh]`、safe-area padding を持つ。
- Sheet は scroll body と fixed footer に分かれ、primary CTA が thumb zone に残る。
- AI 同意 dialog は `initialFocusId="ai-consent-decline"` と `onClose={onDecline}` を維持する。
- AI 同意 copy は写真、名前、月齢、日付、天気、parent note を送るものとして説明する。
- AI を使わない場合は title input に focus し、手動で保存へ進める。
- AI 生成または手入力の本文は保存前に `のこす ことば` として visible confirmation に出る。
- body、日付、天気は fold の中へ下げ、必須 flow から外す。
- upload / AI / save failure は `role="alert"` と quiet state copy を維持し、入力を破棄しない。
- 同じ写真を選び直せるよう、file input の value reset を行う。

## Keyboard / Viewport Verification

- Fixed footer は scroll body の外にあり、keyboard open 時も保存 CTA が sheet 末尾から流れない構造にした。
- Sheet body は `min-h-0` + `overflow-y-auto` で、title / body / date / weather の focus 移動時に本文側だけがスクロールする。
- Footer は safe-area padding を持ち、primary CTA は 44px tap target を継続する。
- 左上の cancel button は `tap-target` を持ち、44px target を維持する。

## Evidence Safety

- PR body と review notes には synthetic 状態名と timing bucket のみを書く。
- 実写真、画像 URL、presigned URL、storage_key 実値、prompt、AI 生成本文は載せない。
- child name が必要な例示は `はな` / `あお` だけに限定する。
