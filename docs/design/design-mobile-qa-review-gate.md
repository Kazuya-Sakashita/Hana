---
title: デザインモバイル QA とレビューゲート
last_updated: 2026-07-23
owner: kazuya
issue: ISSUE-059
requires_human_review:
  - design
  - accessibility
  - privacy
  - release
---

# デザインモバイル QA とレビューゲート

ISSUE-059 は、Quiet Heirloom への画面刷新が Hana MVP の成功条件を壊していないかを、
release gate として確認するための証跡である。

認証済み実データ、production user data、実写真、画像 URL、signed URL、`storage_key` 実値、
prompt、AI 生成本文は証跡に残さない。今回の screenshot は synthetic HTML と synthetic data のみで作成した。

## Target

| 項目          | 内容                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| Issue         | `ISSUE-059`                                                                          |
| Screen / flow | `/record`, home, album, memory detail, tablet overview, desktop overview             |
| Reviewed date | 2026-07-23                                                                           |
| Scope         | mobile screenshot QA、30 秒記録結果集約、keyboard/focus/reduced motion/evidence gate |
| Out of scope  | 認証済み実データ QA、production data screenshot、追加の大規模 redesign、API/DB 変更  |

## 30 秒フロー契約

`docs/design/quiet-heirloom-design-canon.md` の計測条件と一致している。

| パス                       | 計測開始                                      | 計測終了                            | 目標      | ISSUE-059 app-backed 結果          | 到達状態                                 |
| -------------------------- | --------------------------------------------- | ----------------------------------- | --------- | ---------------------------------- | ---------------------------------------- |
| core AI path               | 既存同意済みユーザーが写真 1 枚を選択した時点 | 保存完了 feedback または album 遷移 | 30 秒以内 | 2529ms / pass                      | `/album`                                 |
| AI skip / manual save path | 写真 1 枚を選択した時点                       | 保存完了 feedback または album 遷移 | 30 秒以内 | 1254ms / pass                      | `/album`                                 |
| first consent path         | AI 同意 dialog が表示された時点               | 同意または skip 後に保存可能な状態  | 60 秒以内 | 1820ms / pass                      | story preview and save CTA visible       |
| failure recovery path      | upload / AI / save failure が表示された時点   | 入力を失わず retry できる状態       | 復帰優先  | ISSUE-055 static verification 維持 | retry と role alert の構造を維持する前提 |

## App-backed `/record` QA

実行コマンド:

```bash
CODEX_RUNTIME_NODE_MODULES=/Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules PLAYWRIGHT_BASE_URL=http://localhost:3100 /Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/qa/issue-059-record-stopwatch.cjs
```

結果: pass

確認したこと:

- 実アプリ `/record` を Next dev server 上で開き、API は Playwright route で synthetic response に差し替えた。
- core AI path、AI skip / manual save path、first consent path を ISSUE-059 として再計測した。
- AI skip は `AI を使わずに 書く` 後に title input が focus され、title 入力後に保存可能状態へ進むことを確認した。
- first consent は dialog 表示後、初期 focus が `ai-consent-decline` に置かれることを確認した。
- record primary CTA は `/record` で下部 35% に残ることを確認した。
- 下部 35% の対象は photo pick / save などの完了 CTA。AI 下書きボタンは sheet body 内の選択肢として扱い、完了 CTA とは分けて見る。
- title input は sheet footer に隠れず、sheet body が `overflow-y: auto` であることを確認した。
- initial tab order に `やめて とじる` と `しゃしんを えらぶ` が含まれることを確認した。

Result artifact:

- `docs/design/artifacts/issue-059-mobile-gate/record-stopwatch-results.json`

## Synthetic Screenshot QA

実行コマンド:

```bash
CODEX_RUNTIME_NODE_MODULES=/Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/kazuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/qa/issue-059-design-mobile-gate.cjs
```

結果: pass

確認したこと:

- 390px / 430px / 768px / desktop の synthetic screenshot を生成した。
- `a`, `button`, `input`, `textarea` の tap target が 44px 以上であることを確認した。
- document-level horizontal overflow と通常テキストの overflow がないことを確認した。
- `prefers-reduced-motion: reduce` で screenshot を生成した。
- body text、secondary text、primary CTA、deep sakura link の contrast sample が基準以上であることを確認した。
- guilt / pressure / feed copy として扱う文言が screenshot 内にないことを確認した。
- screenshot HTML に実写真、画像 URL、signed URL、`storage_key` 実値、prompt、AI 生成本文がないことを確認した。

Artifact paths:

- `docs/design/artifacts/issue-059-mobile-gate/record-core-ai-390x844.png`
- `docs/design/artifacts/issue-059-mobile-gate/record-ai-skip-ready-390x844.png`
- `docs/design/artifacts/issue-059-mobile-gate/record-ai-skip-manual-390x844.png`
- `docs/design/artifacts/issue-059-mobile-gate/record-first-consent-430x932.png`
- `docs/design/artifacts/issue-059-mobile-gate/home-empty-390x844.png`
- `docs/design/artifacts/issue-059-mobile-gate/album-shelf-390x844.png`
- `docs/design/artifacts/issue-059-mobile-gate/memory-detail-430x932.png`
- `docs/design/artifacts/issue-059-mobile-gate/tablet-release-768x1024.png`
- `docs/design/artifacts/issue-059-mobile-gate/desktop-release-1280x900.png`
- `docs/design/artifacts/issue-059-mobile-gate/design-mobile-gate-manifest.json`

## Scorecard

| axis                          | score | evidence                                                                           | blocker / warning / pass |
| ----------------------------- | ----- | ---------------------------------------------------------------------------------- | ------------------------ |
| Task Success / 30秒記録       | 4     | ISSUE-059 app-backed `/record` stopwatch が core / skip / consent で目標内         | pass                     |
| Forgiving UX                  | 4     | 未記録日、連続記録、恐怖訴求、失敗回数の pressure copy なし                        | pass                     |
| Emotional Resonance           | 4     | 写真、紙片、本文を主役にし、feed や外向き評価に寄せていない                        | pass                     |
| Privacy Trust                 | 4     | 証跡は synthetic only。画像 URL、signed URL、実データ、AI 本文なし                 | pass                     |
| Content Safety / AI Quietness | 4     | AI は下書きとして扱い、同意 path と使わない path が残っている                      | pass                     |
| Accessibility / Mobile        | 3     | 44px tap、overflow、contrast sample、focus、input occlusion、reduced motion を確認 | warning                  |
| Visual / Brand Consistency    | 4     | Quiet Heirloom の紙片、写真台紙、私的アルバムの方向に一致                          | pass                     |
| Performance Perception        | 4     | app-backed stopwatch latency は mocked under target。待ち不安を増やす演出なし      | pass                     |
| Engineering Feasibility       | 4     | API/DB/Storage 変更なし。QA script と docs/test のみ                               | pass                     |

## Verdict

- Go / Hold / No-Go: Go
- Reason: No-Go blocker なし。Task Success と Privacy Trust は 4 以上、Accessibility / Mobile は 3 以上。専門サブエージェントの blocker は最大 3 回以内の再レビューで解消済み。

warning:

- 実データを使う認証済み QA はこの Issue の範囲外。`ISSUE-041` の QA 用ログイン手段と画像付き QA データが揃うまで、PR 証跡には保存しない。
- 今回の screenshot は release gate の synthetic 代表状態であり、全 OS / 実機差分の代替ではない。
- HEART は単独採点せず、Happiness / Engagement / Adoption / Retention / Task Success の gap を reviewer notes に残す。

## Review Ledger

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを行う。

| round | reviewer                    | verdict | notes                                                                                                              |
| ----- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | Product UX / 30秒記録       | HOLD    | ISSUE-059 として `/record` stopwatch が未完、AI skip artifact 不足、ledger pending で Go 判定が早い。修正済み。    |
| 1     | Privacy / Trust / Content   | HOLD    | PII guard coverage と AI 同意 copy が不足。メール、生年月日、実名らしさ、AI 本文断片検査と copy 明確化を追加済み。 |
| 1     | Visual / A11y / Engineering | HOLD    | 実アプリ surface への拘束、keyboard/focus/input occlusion、lower 35%、manifest freshness が不足。修正済み。        |
| 2     | Product UX / 30秒記録       | HOLD    | stale manifest を検出。generator 再実行と manifest hash 一致を確認し、Round 3 で解消。                             |
| 2     | Privacy / Trust / Content   | GO      | PII guard、同意 copy、synthetic-only evidence に blocker なし。                                                    |
| 2     | Visual / A11y / Engineering | HOLD    | focused test の stale failure を検出。pending 判定を table spacing 非依存にし、Round 3 で解消。                    |
| 3     | Product UX / 30秒記録       | GO      | manifest hash、app-backed `/record` QA、Task Success に blocker なし。                                             |
| 3     | Visual / A11y / Engineering | GO      | focused test、format、lower-35% 注記に blocker なし。                                                              |

## Evidence Policy

- Real child/parent names: none
- Real child photos: none
- Birthdates / emails / production account data: none
- Image URL / signed URL / `storage_key` real value: none
- AI generated memory text or prompt: none
- Screenshot source: synthetic HTML only

## Rollback

- Revert: この PR の docs/test/script/artifact 差分を revert する。
- Data impact: none
- Recovery steps: `scripts/qa/issue-059-design-mobile-gate.cjs` を再実行し、artifact と scorecard を更新する。
