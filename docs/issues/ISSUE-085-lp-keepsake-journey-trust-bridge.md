---
id: ISSUE-085
title: /lp を keepsake journey と public trust bridge へ寄せる
priority: P1
status: done
size: M
created_at: 2026-07-26
parent: PUBLIC-SURFACE-WARMTH
github_issue: 191
blocked_by: []
external_blockers: []
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

`/lp` は角丸改善後も、hero caption、Before / After、Trust が説明カードの反復に見えやすく、本体 Home の「写真台紙が主役で、紙片が添う」体験との距離が残っている。待機リスト登録前の LP を、カード説明中心から、写真・紙片・安心の流れで読める keepsake journey へ寄せる。

## スコープ (What)

- hero preview の caption を、カードではなく保存された紙片として見える構成へ寄せる
- Before / After を3カード列だけに頼らず、写真から記憶になる1本の流れとして読めるようにする
- Trust セクションを「Hana がしないこと」の説明カードから、待機リスト前の安心材料へ自然につなぐ
- フォーム前に、メールだけ / 目的限定 / AI 同意は別、という境界を短く読める bridge を置く
- `lp-soft-*` の独自語彙は、必要なら public surface 向けの共通語彙へ段階移行する
- フォーム内部の bordered card の重なりを減らし、入力と同意を落ち着いた paper slip にする

## やらないこと (Out of Scope)

- Primary CTA の目的変更
- privacy / legal review の完了扱い
- 削除依頼の正式連絡先決定
- メール配信基盤の確定表現
- API / DB / Auth / Storage / OpenAPI の変更

## 受け入れ条件 (Acceptance Criteria)

- [x] `photo-mat` / `paper-slip` / sage CTA の意味分けが `docs/design/lp-app-visual-grammar.md` と一致している
- [x] LP上の repeated card 感が減り、画像・紙片・余白が主役になっている
- [x] 待機リスト CTA 前に、取得目的と AI 同意の境界が読める
- [x] 新しい vendor retention / 完全削除 / 配信基盤 claim を断定していない
- [x] `ISSUE-075` の privacy / legal blocker を解除扱いにしていない
- [x] 既存 `ISSUE-075` QA と `ISSUE-082` visual parity gate が通る

## 検証

- `pnpm exec vitest run tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/prelaunch-lp-route.test.ts`
- `pnpm qa:issue082:lp-app-visual-parity -- --mode=contract`
- `pnpm qa:issue075:lp-public -- --mode=contract`
- 必要に応じて app mode で `/lp` を 390 / 430 / 768 / 1280px 確認

### 2026-07-26 実装結果

- `/lp` の repeated card 型 value proof を、写真台紙から紙片へ流れる `data-lp-keepsake-journey="photo-to-memory"` に変更した
- 待機リスト前に `data-lp-trust-bridge="waitlist"` を追加し、メールだけ / 目的限定 / AI 同意は別、を CTA 前に明示した
- 待機リスト form と no-JS note を light paper slip に寄せ、dark surface 由来の低 contrast copy を除去した
- `ISSUE-075` は privacy / legal review 待ちの blocked のまま維持した

### 2026-07-26 検証結果

- `pnpm exec vitest run tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/prelaunch-lp-route.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts` pass (5 files / 24 tests)
- `pnpm qa:issue075:lp-public -- --mode=contract` pass
- `pnpm qa:issue082:lp-app-visual-parity -- --mode=contract` pass
- `pnpm pr:gate` pass (format / lint / OpenAPI route-map / typecheck / 491 tests / ISSUE-064, ISSUE-075, ISSUE-082 contract QA / build:ci)
- 追加 app mode 探索: `next dev` では Next Dev Tools の 32px button が混入。production app mode の no-JS timeout は `ISSUE-086` の実ブラウザ QA gate 拡張で扱う

### 2026-07-26 専門レビュー結果

- UX / IA: GO。photo-to-memory journey と待機リスト前 trust bridge は受け入れ条件に沿う
- Privacy Trust: GO。vendor retention / AI training / 完全削除 / 法務確認済み / 配信基盤確定 claim の追加なし
- Visual Systems: Round 1 HOLD → no-JS note の contrast と未使用 icon を修正 → Round 2 GO
- Frontend / A11y: Round 1 HOLD → no-JS note regression test を追加 → Round 2 GO

## 専門レビュー観点

| reviewer        | framework                     | 確認観点                                                            |
| --------------- | ----------------------------- | ------------------------------------------------------------------- |
| UX / IA         | conversion trust bridge       | 待機リスト前に、何を預ける / 何に使う / AI とは別、が自然に読めるか |
| Visual Systems  | Quiet Heirloom canon          | カード反復ではなく、写真台紙・紙片・余白の流れになっているか        |
| Privacy Trust   | claim safety                  | trust copy を温かくする過程で未承認 claim を増やしていないか        |
| Frontend / A11y | responsive / focus / contrast | 44px target、focus-visible、contrast、overflow が守られているか     |
