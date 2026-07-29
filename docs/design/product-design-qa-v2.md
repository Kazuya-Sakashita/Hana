---
title: Product Design QA v2
last_updated: 2026-07-25
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

## ISSUE-066 Refinement QA Addendum

`ISSUE-066` 以降の Quiet Heirloom refinement では、従来の DOM / a11y smoke に加えて、
コンセプト画像との差分で見つかった「写真台紙、余白、私的アルバム感、下部記録導線」を確認する。
この addendum は見た目の好みを採点するものではない。Hana の `30秒記録`、
`責めない設計`、`AI は黒子`、`Album not feed` を、実画面で崩さないための契約である。

### Visual Refinement Checks

| check               | pass condition                                                                                             | hold condition                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| photo mat primacy   | Home / Album / Memory Detail の主要領域で、写真または photo mat が説明カードより先に記憶の場所として見える | icon-only card や説明文だけが first view の主役になっている                |
| sage primary action | 記録、保存、完了、bottom navigation の主要 action が sage / leaf 系で落ち着いて見える                      | sakura の大きな面が primary CTA として画面を染める                         |
| sakura restraint    | sakura は focus、favorite、pressed flower ornament、小さな brand accent に留まる                           | 本文、小さい helper text、大面積背景、強い CTA に使われる                  |
| radius taxonomy     | photo-inner 10-12px、photo-mat 14-16px、paper-slip 16-20px、sheet 20-24px の範囲に概ね収まる               | 任意の大きな角丸が増え、紙片ではなくぷっくりしたカード UI に見える         |
| shallow separation  | 通常 surface は hairline と余白で分離し、強い影は sheet / toast / dialog に限定される                      | 通常 card や navigation が強い floating UI に見える                        |
| one-decision record | `/record` は写真選択、下書き、保存確認が一度に迫らず、下部 CTA が親指圏に残る                              | AI、title、date、weather、save が同密度に見え、30 秒記録の判断負荷が上がる |
| private shelf album | `/album` は月別一覧で各ページを1回だけ見せ、写真台紙、紙片、余白で私的な保管感を保つ                       | featured と一覧で同じページを重複表示する、または業務的な一覧に見える      |
| trust density       | Settings / AI consent は概要と詳細が分かれ、送るもの / 送らないもの / 保持説明を隠さない                   | 余白を優先して同意や data boundary が曖昧になる                            |

### Evidence Safety Additions

- refinement QA の screenshot / manifest / PR body には、実写真、production data、画像 URL、signed URL、
  `storage_key`、prompt、AI 生成本文を残さない
- child name が必要な場合は `はな` / `あお` などの synthetic name だけを使う
- 生成画像内の日本語文言、AI 同意文言、privacy claim は unsafe draft として扱い、active UI に転記しない
- pressed flower / paper fiber などの ornament は `aria-hidden` で、本文、写真、同意説明を覆わない
- OpenAPI / DB / 認証 / Storage 変更を伴わない refinement PR では、その旨を PR body に明記する

### Issue Mapping

| issue       | QA focus                                                       | required before                         |
| ----------- | -------------------------------------------------------------- | --------------------------------------- |
| `ISSUE-066` | contract definition、QA addendum、issue dependency             | `ISSUE-067`                             |
| `ISSUE-067` | sage/sakura semantics、radius taxonomy、shadow scope、contrast | `ISSUE-068` / `ISSUE-069` / `ISSUE-070` |
| `ISSUE-068` | home first view、photo mat primacy、pressure copy              | release of home refinement              |
| `ISSUE-069` | record bottom sheet、one-decision density、AI consent boundary | release of record refinement            |
| `ISSUE-070` | album private shelf、memory detail action density、多件数QA    | release of album/detail refinement      |

## ISSUE-076 LP-App Visual Parity Gate

`ISSUE-076` 以降は、LP と本体アプリが同じ視覚世界に見えることを
`docs/design/lp-app-visual-grammar.md` で確認する。これは LP を理想図として固定するものではなく、
LP / 参照画像で強まった `photo mat + paper slip + sage pill + quiet icon` を
本体アプリの実装契約に戻すための gate である。

| check          | pass condition                                                                                                     | hold condition                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| token parity   | LP と app の canvas、paper-slip、photo-mat、ink、sage、sakura、radius token が一致、または差分理由が記録されている | 差分理由のない token drift                             |
| icon parity    | lucide icon の語彙、stroke、色、fill 例外が共通規約に沿う                                                          | 文字 glyph、default stroke 2 の散在、AI sparkles 多用  |
| surface parity | Home は写真台紙、Record は写真 + 下部 sheet、Album は private shelf、Memory Detail は写真と本文が action より先    | 説明 card、一覧 list、操作 menu が主役に戻る           |
| CTA parity     | 記録、保存、完了、待機リストの primary action が sage pill として見える                                            | sakura の大面積 CTA、強い shadow、浮きすぎた FAB       |
| active state   | Bottom navigation や tabs が色だけに依存せず、pill / underline / surface 差で状態を示す                            | 色と太さだけで active を表す                           |
| tap target     | 全 interactive target は 44px 以上、primary CTA は 48px 以上                                                       | toast close や小 text button が 44px 未満              |
| contrast       | body text は 7:1 目標、helper / status text は 4.5:1 以上、focus indicator と non-text UI は 3:1 以上              | sakura / leaf の小文字 text や icon state の比率未測定 |
| trust safety   | vendor retention、ZDR、完全削除、復元可能など未確認 claim を断定しない                                             | visual score で trust blocker を相殺する               |

### LP-App Screenshot Matrix

| 対象                            | 状態                                                                                | Viewports                            |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| LP                              | hero、Before/After、product preview、trust / final CTA                              | 390x844、430x932、768x1024、1280x900 |
| Home                            | empty、1 memory、5 memories、long child name                                        | 390x640、390x844、430x932、768x1024  |
| Record                          | empty、photo selected、AI consent、generating、manual save ready、save ready、error | 390x640、390x844、430x932            |
| Album                           | all-empty、month-empty、1 memory、long title / body、load more / end                | 390x844、430x932、768x1024           |
| Memory Detail                   | saved notice、normal、long body、additional photos                                  | 390x844、430x932                     |
| Sign-in / Onboarding / Settings | auth entry、first-memory bridge、trust surface                                      | 390x844、430x932                     |

### LP-App Static Checks

- `lp-app-visual-grammar.md` が `quiet-heirloom-design-canon.md` とこの QA 文書から参照されている
- `sage` は記録、保存、完了、待機リスト CTA に限定して primary として使われる
- `sakura` は favorite、focus、pressed flower、小さな brand accent に限定される
- icon は lucide を標準とし、操作 icon の custom 化を増やさない
- contrast gate は body text 7:1 目標、helper / status text 4.5:1 以上、focus indicator / non-text UI 3:1 以上を確認する
- screenshot / manifest / PR body に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを含めない

## ISSUE-082 LP-App Visual Parity Contract

`ISSUE-082` では、上記の LP-App visual parity を read-only CI contract として固定する。
対象は LP artifact と、本体 app の Home / Record / Album / Memory Detail / Sign-in /
Onboarding / Settings である。

実行コマンド:

```bash
pnpm qa:issue082:lp-app-visual-parity -- --mode=contract
```

contract mode は `docs/design/lp-app-visual-parity-qa.md` の screenshot matrix、
token parity、surface parity、icon parity、contrast、tap target、evidence safety、
trust copy を検査する。CI は screenshot、accessibility snapshot、manifest、QA evidence file を
書き込まない。出力 JSON は file id、surface id、matrix id、check 名だけに限定し、
本文、画像 URL、signed URL、メール、prompt、AI 生成本文を保存しない。

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
