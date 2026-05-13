---
id: ISSUE-001
title: プロジェクト初期設定
priority: P0
status: todo
size: S
created_at: 2026-05-14
---

## 目的 (Why)

Hana を **API 駆動開発** で進めるための土台を整える。
ここが整っていないと、後続の Issue（OpenAPI 基盤、認証、写真、AI）が安全に進められない。

具体的には:

- 開発者（人間 + Claude Code）が同じ手順で作業できる
- 個人開発でも 3 ヶ月放置から復帰できる
- 機密情報・生成物の取扱いが Git で破綻しない

---

## スコープ (What)

- [ ] アプリケーションプロジェクトの初期化（Next.js App Router または Expo を採用）
  - 本 Issue では **採用フレームワーク確定** + 雛形生成までを行う
  - 初期化後の方針は ADR `0002-frontend-stack.md` に記録
- [ ] TypeScript strict 設定（`tsconfig.json`）
- [ ] ESLint / Prettier 設定（最小構成）
- [ ] `.gitignore` の整備（CLAUDE.md §13 / 親ガイド §8 準拠）
- [ ] `.env.example` の配置（キー名のみ、値は空）
- [ ] `README.md` の雛形（プロジェクト概要 + セットアップ手順）
- [ ] `CLAUDE.md` の確認（既に配置済み。リンク切れがないか確認）
- [ ] `docs/api-driven-development/README.md` の確認（既に配置済み）
- [ ] `docs/adr/0001-openapi-as-sot.md` の配置
- [ ] 基本 npm scripts: `typecheck`, `lint`, `test`
- [ ] CI: `.github/workflows/typecheck.yml`（typecheck と lint を必須化）
- [ ] Issue / PR テンプレート配置
  - `.github/ISSUE_TEMPLATE/feature.md`
  - `.github/ISSUE_TEMPLATE/api-change.md`
  - `.github/pull_request_template.md`

---

## やらないこと (Out of Scope)

- OpenAPI ファイルの作成（→ ISSUE-002）
- 型生成パイプライン（→ ISSUE-003）
- API クライアント実装（→ ISSUE-004）
- 認証実装（→ ISSUE-005）
- DB セットアップ・スキーマ設計（別 Issue）
- 本番デプロイ設定（β 前に別 Issue）

---

## 影響範囲

| 領域 | 影響 |
|---|---|
| OpenAPI | なし |
| 生成型 | なし |
| 画面 | 雛形のみ |
| データ | なし |
| CI | typecheck / lint を新規追加 |
| ドキュメント | README / ADR 0001 追加 |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `npm install` がエラーなしで完了する
- [ ] `npm run typecheck` がエラー 0 で通る
- [ ] `npm run lint` がエラー 0 で通る
- [ ] CI（typecheck / lint）が PR で必須化されている
- [ ] `.gitignore` に下記が含まれる
  - `.claude/settings.local.json`
  - `node_modules/`
  - `.env`, `.env.local`, `.env.*.local`
  - ビルド成果物（`.next/`, `dist/`, `build/`, `.turbo/` 等）
  - `docs/openapi/openapi.bundled.yaml`
- [ ] `.env.example` が存在し、値が空である
- [ ] README に下記が書かれている
  - プロジェクト概要（1 段落）
  - セットアップ手順（`npm install` → `npm run dev`）
  - リンク: `CLAUDE.md` / `docs/api-driven-development/README.md` / `Hana_PRD_v1.md`
- [ ] `docs/adr/0001-openapi-as-sot.md` が配置され、Status が accepted
- [ ] Issue テンプレ / PR テンプレが GitHub 上で選択肢に出る

---

## セキュリティ・プライバシー考慮

- [ ] `.env` を絶対に Git に含めない（`.env.example` のみ Git 管理）
- [ ] `.gitignore` に PII を含みうるディレクトリ（`/tmp/`, `/uploads-local/`）を含める
- [ ] README に「子どもの写真・実データを含むファイルをコミットしない」旨を 1 行明記
- [ ] PR テンプレに「ログに PII が出ていないか」のチェックボックスを含める

---

## 採用判断メモ（ADR 候補）

このIssueで決める必要があるが、本 Issue 完了後に ADR として記録する事項:

1. **フロントスタック**: Next.js (App Router) / Expo (React Native) のどちらか
   - Web 先行なら Next.js、ネイティブ体験重視なら Expo
   - 初期推奨: **Next.js + PWA**（モバイル先行だがアプリストア審査を後回しにできる）
2. **パッケージマネージャ**: pnpm / npm / yarn
   - 初期推奨: **pnpm**（個人開発で速度・容量に効く）
3. **モノレポか単一リポか**
   - MVP 段階は単一リポで十分

---

## 参考

- `CLAUDE.md`
- `docs/api-driven-development/README.md`
- `Hana_PRD_v1.md` §6 MVP 仕様, §17 ロードマップ
