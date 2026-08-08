---
id: ISSUE-159
title: PRD契約とfunnelのGo・Hold基準を再同期する
priority: P1
status: review
size: M
created_at: 2026-08-03
github_issue: 327
release_gate: product_validation
requires_human_review:
  - product
  - privacy
---

# ISSUE-159: PRD契約とfunnelのGo・Hold基準を再同期する

## 目的 (Why)

PRDのactive product contractとfunnelのGo/Hold基準を現行実装・ADR・privacy契約へ揃える。

## スコープ (What)

- 30/60秒、認証、AI送信、MVP範囲の矛盾解消
- 主張の事実/仮説/未検証分類
- 未実装・対象外を含む公開claim inventoryとcopy是正
- M1〜M12のeligible unit、観測窓、min、欠測、threshold、判定gate
- primary / secondary suppression、evidence version、scope handoff
- PRD疑似schemaの撤去とPrisma SSOTの明示

## やらないこと (Out of Scope)

- 未検証の30秒・AI品質を事実として断定すること
- 少数利用者を特定できる集計
- telemetry相関・集約runtime、pilot実施、release gate、退会purgeの実装

## 影響範囲

- `Hana_PRD_v1.md`のactive product contract、MVP、認証、AI送信、HEART、North Star
- `docs/product-validation/funnel-go-hold-contract.md`のcohort、欠測、抑止、判定、人間review
- `src/app/lp/page.tsx`、`src/app/page.tsx`、current LP artifactの公開claim
- PRDと測定契約のdriftを表・frontmatter単位で防ぐstructured contract test

OpenAPI、生成型、API runtime、DB、Storage、既存event payloadは変更しない。画面変更はcopyだけに限定する。

## 受け入れ条件 (Acceptance Criteria)

- [x] 30秒と60秒、cookie/SNS認証、外部AI送信、MVP範囲の矛盾を解消する
- [x] 各主張を確認済み事実、検証仮説、未検証、未実装・対象外へ分類する
- [x] LP / Home / Record / current LP artifactから未検証の速度・感情成果・store claimを除く
- [x] M1〜M12へeligible unit、UTC半開区間、min、欠測、threshold、gateを固定する
- [x] event欠測を離脱扱いせず、ISSUE-188のDB相関・completeness完了までは該当metricをHoldにする
- [x] primary / secondary suppressionとevidence versionの無効化条件を定義する
- [x] 退会right-censorをworst-case区間で判定し、census / censor digestをevidenceへ束縛する
- [x] pilot、release、telemetry、purgeをISSUE-160 / 162 / 152 / 185へ分離する
- [x] PRDの疑似SQLを撤去し、`prisma/schema.prisma`をfield / relationの正本にする
- [x] ProductとPrivacyの人間review欄を用意する

## セキュリティ・プライバシー考慮

分母・分子・補集合と差分復元を抑止し、raw eventへのaccessをISSUE-188の最小権限jobへ限定する。
ProductとPrivacyは同じevidence versionをreviewし、ISSUE-185完了まではPrivacy Goにしない。

## 人間review

| review  | status  | evidence                                         |
| ------- | ------- | ------------------------------------------------ |
| Product | pending | M1〜M12、claim inventory、ISSUE-160への接続      |
| Privacy | pending | suppression、欠測、保持、ISSUE-161 / 185への接続 |

どちらかがpending / Hold / No-Goなら、総合判定はGoにならない。

## 専門review

- Round 1（2026-08-07）: 6名全員HOLD
- Product / Privacy / Analytics / UX / Implementation / QAのP1をISSUE-159、ISSUE-188、
  ISSUE-160、ISSUE-162、ISSUE-185へscope分割した
- Round 2（2026-08-07）: 6名全員GO。P0 / P1なし、指摘されたP2も反映済み
- Product / Privacyの人間reviewはpendingであり、product / releaseのHoldを変更しない

## 検証

- `pnpm openapi:lint`（既存warningのみ）
- `pnpm openapi:gen`（生成物差分なし）
- `pnpm issues:check`
- `pnpm typecheck`
- ISSUE-159 + copy regression focused tests: 12 files / 60 tests
- `pnpm pr:gate`（180 files passed / 5 skipped、1535 tests passed / 12 skipped、production build成功）
- `git diff --check`

## 参考

- GitHub Issue #327
- Hana_PRD_v1.md
- `docs/product-validation/funnel-go-hold-contract.md`
- ISSUE-188（ISSUE-152置換）/ ISSUE-160 / ISSUE-162 / ISSUE-185
