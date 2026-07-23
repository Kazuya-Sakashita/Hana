---
title: Product Design QA v2
last_updated: 2026-07-24
owner: kazuya
issue: ISSUE-064
requires_human_review:
  - design
  - accessibility
  - privacy
  - release
---

# Product Design QA v2

ISSUE-064 は、Quiet Heirloom の見た目を screenshot 代表状態だけで判断せず、
実 DOM の構造と操作可能性を継続的に守るための QA 契約である。

この文書と `scripts/qa/issue-064-design-dom-smoke.cjs` は、CI で走らせる read-only
contract check と、認証済み QA セッションで走らせる app-backed DOM smoke を分ける。
CI は artifact を上書きしない。screenshot / accessibility snapshot は手動更新用の証跡でのみ扱う。

## Target Surfaces

| surface       | route                | CI contract | app-backed DOM smoke | auth mode                 |
| ------------- | -------------------- | ----------- | -------------------- | ------------------------- |
| home          | `/`                  | required    | release required     | server session required   |
| record        | `/record`            | required    | release required     | synthetic client API mock |
| album         | `/album`             | required    | release required     | server session required   |
| memory detail | `/memory/[memoryId]` | required    | release required     | server session required   |
| settings      | `/settings`          | required    | release required     | synthetic client API mock |
| onboarding    | `/onboarding`        | required    | release required     | synthetic client API mock |

## Viewport Matrix

| viewport      | size       | reason                                 |
| ------------- | ---------- | -------------------------------------- |
| compact-short | `390x640`  | `AppShell` / `FocusedShell` の短い縦幅 |
| compact-tall  | `390x844`  | 小型 iPhone 相当の主要 mobile          |
| large-phone   | `430x932`  | 大きめ mobile と saved state           |
| tablet        | `768x1024` | tablet 1-column / density              |

## CI Contract

実行コマンド:

```bash
pnpm qa:issue064:design-dom-smoke -- --mode=contract
```

`pnpm pr:gate` に含める。contract mode は次を確認する。

- 対象 route に `/`, `/record`, `/album`, `/memory/[memoryId]`, `/settings`, `/onboarding` が含まれる
- interactive target selector に `summary`, `[role="button"]`, focusable element が含まれる
- check list に heading order、tap target、focus order、visible focus、horizontal overflow、reduced motion が含まれる
- CI は screenshot、accessibility snapshot、manifest などの artifact を書き込まない
- 出力 JSON は route id、redacted route pattern、auth mode、viewport id、check 名、selector 名だけを持ち、本文や画像 URL を保存しない

## App-backed DOM Smoke

実行コマンド:

```bash
CODEX_RUNTIME_NODE_MODULES=<node_modules-with-playwright> \
HANA_QA_STORAGE_STATE=<redacted-auth-storage-state.json> \
HANA_QA_MEMORY_ID=<synthetic-memory-id> \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
pnpm qa:issue064:design-dom-smoke -- --mode=app
```

app mode は Next dev / start 上の実 DOM を Playwright で開き、次を確認する。

| check               | method                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| route identity      | final pathname、HTTP status、画面固有の stable selector が対象 surface と一致すること                      |
| heading order       | visible `h1` があり、`h1` から `h2` / `h3` への階層 jump がないこと                                        |
| tap target          | `a`, `button`, `input`, `textarea`, `select`, `summary`, `[role="button"]`, focusable element が 44px 以上 |
| focus order         | `Tab` で到達できる element があり、各 stop の visible focus が出ること                                     |
| horizontal overflow | document overflow と通常テキストの横あふれがないこと。明示的な horizontal scroller は除外                  |
| reduced motion      | `prefers-reduced-motion: reduce` で長い animation が残らないこと                                           |
| pressure copy       | guilt、streak、feed、ranking、fear urgency の文言が DOM text に出ないこと                                  |
| evidence safety     | 出力に本文、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さないこと                         |

認証が必要な `/`, `/album`, `/memory/[memoryId]` は、production data ではなく synthetic QA account
の `HANA_QA_STORAGE_STATE` と synthetic memory id を使う。`/record`, `/settings`, `/onboarding`
は client API を synthetic route mock に差し替えられるが、実装上は auth-backed API を使うため、
公開 route ではなく auth-backed surface として扱う。

未認証で `/sign-in` に redirect された場合、対象外 route に流れた場合、または 404 / notFound の場合は
Hold とし、失敗出力には route id、check id、element index、tag、role、寸法などの redacted metadata だけを残す。

認証なしで client API mockable surface だけを確認する場合:

```bash
CODEX_RUNTIME_NODE_MODULES=<node_modules-with-playwright> \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
pnpm qa:issue064:design-dom-smoke -- --mode=app --surfaces=record,settings,onboarding
```

## Screenshot / Accessibility Snapshot Policy

- CI は screenshot や accessibility snapshot を生成・上書きしない
- 手動更新が必要な場合だけ、別コマンドまたは既存 ISSUE-059 artifact generator で synthetic data を使う
- 保存する snapshot は role / name / state の redacted summary に限定する
- 実写真、production account、画像 URL、signed URL、`storage_key` 実値、prompt、AI 生成本文は保存しない
- child name が必要な場合は `はな` / `あお` などの synthetic name だけを使う
- 実機差分、OS 差分、認証済み実データ画像 QA は `ISSUE-041` の範囲に残す

## Result

2026-07-24 時点:

- CI contract: `pnpm qa:issue064:design-dom-smoke -- --mode=contract` pass
- Full PR gate: `pnpm pr:gate` pass
- app-backed DOM smoke: release required。認証済み QA session と Playwright runtime が必要なため、この PR では CI contract と再現手順の追加まで

## Review Ledger

専門サブエージェント 3 名で Design System / Accessibility / Privacy-Release の read-only review を行い、
最大 3 回まで修正と再レビューを行う。

| round | reviewer          | verdict | notes                                                                                         |
| ----- | ----------------- | ------- | --------------------------------------------------------------------------------------------- |
| 1     | Design System     | HOLD    | failure output に DOM text 由来 label が混ざる blocker。redacted metadata のみに修正済み。    |
| 1     | Accessibility     | HOLD    | route-specific final pathname / stable selector 不足、Playwright runtime 前提不足。修正済み。 |
| 1     | Privacy / Release | HOLD    | failure stderr の PII 混入余地と auth mode の誤読リスク。redaction と docs 明記で修正済み。   |
| 2     | Design System     | GO      | 残 blocker なし。                                                                             |
| 2     | Accessibility     | GO      | 残 blocker なし。                                                                             |
| 2     | Privacy / Release | GO      | 残 blocker なし。                                                                             |

## Rollback

- Revert: `package.json`, `scripts/qa/issue-064-design-dom-smoke.cjs`, `tests/unit/app/product-design-qa-v2.test.ts`, この文書、Issue index の差分を revert する
- Data impact: none
- Recovery steps: `pnpm pr:gate` を再実行し、必要なら ISSUE-059 screenshot gate に戻して確認する
