---
id: ISSUE-076
title: LP と本体アプリの視覚語彙を接続する
priority: P0
status: done
size: M
created_at: 2026-07-25
parent: APP-DESIGN-PARITY
github_issue: 171
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

LP は `photo mat`、`paper slip`、sage の pill CTA、細い icon によって、やさしく落ち着いた印象に寄っている。
一方で本体アプリには、汎用カード、強い FAB、画面ごとに散った icon、フォーム感がまだ残っている。

画面別に個別修正を始める前に、LP / 参照画像の質感を本体アプリの実装契約へ翻訳し、後続 Issue の判断基準を固定する。

## スコープ (What)

- LP と本体アプリを接続する visual grammar 文書を追加する
- `quiet-heirloom-design-canon.md` に LP-App 橋渡しの参照を追加する
- `product-design-qa-v2.md` に LP-App visual parity gate を追加する
- Icon language、surface taxonomy、CTA semantics、screenshot matrix、evidence policy を明文化する
- 後続 Issue の分割案を記録する
- 静的テストで文書契約が消えないようにする

## やらないこと (Out of Scope)

- Home / Record / Album / Memory Detail / Sign-in / Onboarding / Settings の画面実装修正
- API / DB / Auth / Storage / OpenAPI の変更
- LP 公開前 QA や privacy / legal human review の完了
- 実写真や本番データを使った screenshot 作成

## 影響範囲

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/design/README.md`
- `docs/issues/README.md`
- `tests/unit/app/lp-app-visual-grammar.test.ts`

## 受け入れ条件 (Acceptance Criteria)

- [x] LP と本体アプリの visual grammar が日本語で文書化されている
- [x] `photo mat` / `paper slip` / `sage pill` / `sakura restraint` / `quiet icon` の使い分けが明文化されている
- [x] icon language が lucide 標準、stroke、色、fill 例外、custom icon 例外として定義されている
- [x] 後続 Issue の分割案が `ISSUE-077` 以降として記録されている
- [x] QA gate に token parity、surface parity、icon parity、tap target、trust safety が含まれている
- [x] evidence policy に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さないことが含まれている
- [x] focused unit test が通る

## セキュリティ・プライバシー考慮

- 生成画像と LP artifact は mood evidence として扱い、画像内 copy / trust claim を本番 UI に転記しない
- 未確認の vendor retention、zero data retention、完全削除、復元可能などは断定しない
- screenshot / manifest / PR body に PII、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さない
- OpenAPI / DB / Auth / Storage には触れない

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/design/lp-app-visual-grammar.md`
- `docs/design/current-lp-evaluation.md`
- `Hana_PRD_v1.md`

## 検証

- 2026-07-25: `pnpm exec vitest tests/unit/app/lp-app-visual-grammar.test.ts --run` pass
- 2026-07-25: `pnpm exec vitest tests/unit/app/lp-app-visual-grammar.test.ts tests/unit/app/product-design-qa-v2.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts tests/unit/app/quiet-heirloom-common-ui.test.ts --run` pass
- 2026-07-25: `pnpm pr:gate` pass

補足: 初回 `pnpm pr:gate` は、前ブランチの `.next/types` が `privacy/page` と `v1/waitlist`
を参照していた stale cache により typecheck で失敗した。`pnpm exec next typegen` で現ブランチの
route types を再生成した後、`pnpm pr:gate` は成功した。

## 実装メモ

- `docs/design/lp-app-visual-grammar.md` を追加し、LP / 参照画像の質感を app 実装契約へ翻訳した
- `quiet-heirloom-design-canon.md` に LP-App 橋渡し正本と icon language の参照を追加した
- `product-design-qa-v2.md` に LP-App visual parity gate と screenshot matrix を追加した
- GitHub Issue: #171

## Review Ledger

| round | reviewer                  | verdict         | notes                                                                  |
| ----- | ------------------------- | --------------- | ---------------------------------------------------------------------- |
| 1     | Design System             | Conditional Go  | 証跡出所、候補 Issue ID、Home の担当範囲を明確化する warning           |
| 1     | Accessibility / QA        | Hold            | contrast gate と現時点の `pnpm pr:gate` evidence が不足                |
| 1     | Privacy / Trust / Process | Go with warning | unsafe claim はなし。証跡出所と GitHub index、禁止文脈 test を強化する |
| 2     | Design System             | Go              | Input Evidence、候補 Issue ID、Home の coverage path を確認            |
| 2     | Accessibility / QA        | Go              | contrast threshold と `pnpm pr:gate` evidence を確認                   |
| 2     | Privacy / Trust / Process | Go              | unsafe claim context、GitHub index、candidate scope を確認             |
