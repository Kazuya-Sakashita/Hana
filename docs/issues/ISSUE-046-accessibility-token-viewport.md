---
id: ISSUE-046
title: Accessibility token and viewport remediation
priority: P0
status: review
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 97
requires_human_review:
  - accessibility
  - design
---

## 目的 (Why)

ISSUE-045 の P0 指摘のうち、すぐに安全に直せる accessibility blocker を小さく解消する。
ブラウザ zoom lock と低コントラスト token は、Hana の flow や API を変えずに改善できるため、
dialog 基盤や写真 alt 方針より先に切り出して対応する。

## スコープ (What)

- viewport metadata から zoom lock を外す
- `--ink-tertiary` / `--success-leaf` / `--warning-amber` を warm surface 上で読める濃度にする
- token contrast と viewport zoom lock の自動テストを追加する
- Issue index を `ISSUE-045 done` / `ISSUE-046 in_progress` に同期する

## やらないこと (Out of Scope)

- dialog focus trap / Escape / background scroll lock の実装
- memory photo alt policy の決定
- 画面 layout や copy の再設計
- OpenAPI / API / DB / storage / AI 仕様の変更

## 影響範囲

| 領域         | 影響                                                  |
| ------------ | ----------------------------------------------------- |
| OpenAPI      | なし                                                  |
| 生成型       | なし                                                  |
| アプリコード | viewport metadata、design tokens                      |
| テスト       | CSS token contrast と viewport zoom lock の unit test |
| ドキュメント | ISSUE-046 正本、Issue index                           |

## 受け入れ条件 (Acceptance Criteria)

- [x] Browser zoom が viewport metadata で lock されていない
- [x] helper / status text token が Hana の canvas / elevated / warm surface 上で 4.5:1 以上
- [x] token contrast と viewport zoom lock を自動テストで検証している
- [x] dialog focus と photo alt policy は後続 Issue として scope 外に明記している
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## サブエージェント検討

2名の read-only サブエージェントで並行検討した。

| 観点                       | 反映内容                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| Accessibility color / zoom | same-hue darkening の token 候補を採用し、zoom lock は2項目削除で十分と確認 |
| Automated test strategy    | CSS / layout を import せず静的検査し、small text/status token に限定       |

## 検証

- `pnpm test -- tests/unit/app/accessibility-baseline.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- UI token と viewport の変更のみで、個人情報・画像・AI 生成本文・storage_key は扱わない
- テスト fixture に実データを追加しない

## 後続 Issue 候補

- `ISSUE-047`: Dialog accessibility foundation
- `ISSUE-050`: Memory photo alt and privacy display policy

## 参考

- GitHub Issue #97
- `docs/design/design-inventory-roadmap.md`
- `docs/design/design-evaluation-rubric.md`
- `docs/design/design-organization.md`
