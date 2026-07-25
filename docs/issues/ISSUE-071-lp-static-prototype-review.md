---
id: ISSUE-071
title: LP 静的プロトタイプと専門家評価を公開前課題へ整理
priority: P0
status: done
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 162
blocked_by: []
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

現行の Quiet Heirloom デザインを一度 LP として見える形にし、公開 LP へ進める前の不足を専門レビューと評価フレームで明確にする。

## スコープ (What)

- 現行デザインの方向性を反映した静的 LP プロトタイプを `docs/design/artifacts/current-lp/` に作成する
- Product UX、Brand / Conversion、Visual、Accessibility、Privacy / Trust の観点で専門レビューを実施する
- LIFT / AIDA / HEART / WCAG / Trust before delight などのフレームワークで評価する
- 完成度を上げる課題を P0 / P1 / P2 に整理する

## やらないこと (Out of Scope)

- 本番 LP route の追加
- 待機リスト、通知フォーム、Store URL の実接続
- API、DB、Auth、Storage の変更
- 実写真、production account、実ユーザー情報を使った証跡作成

## 受け入れ条件 (Acceptance Criteria)

- [x] 静的 LP prototype が作成されている
- [x] LP 用の軽量 visual asset が作成されている
- [x] 専門サブエージェント 5 名の read-only review 結果が整理されている
- [x] フレームワーク別の score / verdict が整理されている
- [x] P0 / P1 / P2 の公開前課題が整理されている
- [x] LP artifact に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- [x] HTML の基本構造、参照切れ、format、diff whitespace を確認する

## レビュー

専門サブエージェント 5 名で read-only review を実施した。

| reviewer                 | framework                              | verdict        | notes                                                                   |
| ------------------------ | -------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Product UX / HEART       | HEART + JTBD                           | Hold           | 情緒と JTBD は合うが、Adoption CTA と Before / After の証拠が弱い       |
| Brand / Conversion       | LIFT + AIDA                            | Hold           | Brand は Go 寄り。Action と Desire が低く、Store / 待機リスト導線が必要 |
| Visual Art Direction     | Quiet Heirloom + AI slop blacklist     | Hold           | 色・書体は合うが、hero の主役が割れ、説明スライド感が残る               |
| Accessibility / Frontend | WCAG 2.2 AA + Nielsen                  | Conditional Go | 構造は良い。公開前に実ブラウザ QA が必要                                |
| Privacy / Trust          | Trust before delight + evidence policy | Conditional Go | 危険な断定は回避。公開 copy は最終レビューが必要                        |

## 検証

- `pnpm exec prettier --check docs/design/artifacts/current-lp/index.html docs/design/current-lp-evaluation.md`
- `pnpm exec vitest run tests/unit/app/lp-static-prototype-review.test.ts`
- `pnpm exec eslint tests/unit/app/lp-static-prototype-review.test.ts`
- `pnpm exec prettier --check docs/design/artifacts/current-lp/index.html docs/design/current-lp-evaluation.md docs/issues/ISSUE-071-lp-static-prototype-review.md docs/issues/ISSUE-072-lp-conversion-path.md docs/issues/ISSUE-073-lp-before-after-proof.md docs/issues/ISSUE-074-lp-hero-keepsake-composition.md docs/issues/ISSUE-075-lp-public-qa-trust-gate.md docs/issues/README.md tests/unit/app/lp-static-prototype-review.test.ts`
- HTML 参照切れチェック
- H1 / image alt / focus-visible / reduced motion / viewport の静的チェック
- privacy claim / URL / `storage_key` 実値混入チェック
- `git diff --check`

## セキュリティ・プライバシー考慮

- 証跡には実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない
- AI、保持、学習、削除保証に関する公開 claim は後続 Issue の human review gate で扱う
- 今回の LP prototype は static design artifact であり、production data を参照しない

## 参考

- `docs/design/artifacts/current-lp/index.html`
- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/ai-consent-privacy-evidence.md`
