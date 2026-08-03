# Hana

> 写真1枚から、AIが子どもとの記憶を物語にする育児記録アプリ。
>
> 親が「書く」ことなく、今日の瞬間を残せる。

---

## このリポジトリで読むべきドキュメント

| ドキュメント                                                                                                           | 役割                                   |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`Hana_PRD_v1.md`](./Hana_PRD_v1.md)                                                                                   | プロダクト仕様（ビジネス側の真実の源） |
| [`AGENTS.md`](./AGENTS.md)                                                                                             | Codex 用の開発運用ルール               |
| [`CLAUDE.md`](./CLAUDE.md)                                                                                             | Claude Code 用の開発運用ルール         |
| [`docs/api-driven-development/README.md`](./docs/api-driven-development/README.md)                                     | API 駆動開発フロー                     |
| [`docs/api-driven-development/codex-automation-runbook.md`](./docs/api-driven-development/codex-automation-runbook.md) | Codex 自動開発 Runbook                 |
| [`docs/api-driven-development/security-and-privacy.md`](./docs/api-driven-development/security-and-privacy.md)         | セキュリティ・プライバシー運用ガイド   |
| [`docs/openapi/openapi.yaml`](./docs/openapi/openapi.yaml)                                                             | API 仕様（技術側の真実の源）           |
| [`docs/issues/`](./docs/issues/)                                                                                       | Issue の永続コピー                     |
| [`docs/adr/`](./docs/adr/)                                                                                             | アーキテクチャ判断記録                 |

---

## スタック

- **Next.js (App Router) 16.x** + React 19 + TypeScript 6（strict）
- バックエンドは **Next.js Route Handlers** で同居
- パッケージマネージャ: **pnpm 10**
- API 契約: **OpenAPI 3.1**（Single Source of Truth）
- データフェッチ: TanStack Query v5（導入は後続 Issue）

詳細は [`docs/adr/0002-frontend-stack.md`](./docs/adr/0002-frontend-stack.md) を参照。

---

## セットアップ

```bash
# 1. 依存をインストール
pnpm install

# 2. 環境変数を準備（.env.local は Git 管理外）
cp .env.example .env.local
# Supabase の接続情報を取得して埋める（手順は下記）

# 3. DB を初期化
pnpm db:generate
pnpm db:migrate

# 4. 開発サーバを起動
pnpm dev
# → http://localhost:3000
```

### Supabase / Prisma の詳しいセットアップ

[`docs/api-driven-development/db-setup.md`](./docs/api-driven-development/db-setup.md) を参照（5 分で完了）。

---

## よく使うコマンド

```bash
pnpm dev                  # 開発サーバ
pnpm build                # 本番ビルド
pnpm start                # ビルド済みを起動
pnpm typecheck            # TypeScript 型チェック
pnpm lint                 # ESLint
pnpm lint:fix             # ESLint --fix
pnpm format               # Prettier 整形
pnpm format:check         # Prettier 差分チェック
pnpm test                 # Vitest 1 回実行
pnpm test:watch           # Vitest watch モード

# OpenAPI
pnpm openapi:lint         # redocly + spectral で OpenAPI を検証
pnpm openapi:route-map    # OpenAPI paths と src/app/v1 Route Handler を照合
pnpm openapi:bundle       # 分割ファイルを 1 つに集約
pnpm openapi:gen          # OpenAPI → TypeScript 型を再生成
pnpm openapi:check-breaking  # mainとの差分でWARN以上の破壊変更を失敗させる
pnpm openapi:auth-contract   # 全Routeの認証・所有権matrixを実装と照合
pnpm openapi:response-contract # 公開operation等のstatus/content/schemaを検証
pnpm openapi:all          # lint → route-map → bundle → gen

# Database (Supabase + Prisma)
pnpm db:generate          # Prisma Client の型を生成
pnpm db:migrate           # ローカル: 開発用 migration を作成・適用
pnpm db:migrate:deploy    # 本番/CI: 既存 migration を適用
pnpm db:studio            # Prisma Studio (DB GUI) を起動
```

---

## ディレクトリ構成

```text
.
├── AGENTS.md                          Codex 用の開発運用ルール
├── CLAUDE.md                          Claude Code 用の開発運用ルール
├── Hana_PRD_v1.md                     プロダクト仕様
├── README.md                          このファイル
├── docs/
│   ├── api-driven-development/        API 駆動開発ガイド
│   ├── openapi/                       API 仕様（ISSUE-002 で配置）
│   ├── adr/                           アーキテクチャ判断記録
│   └── issues/                        Issue の永続コピー
├── src/
│   ├── app/                           Next.js App Router
│   ├── features/                      機能スライス（後続 Issue で追加）
│   ├── lib/api/                       API クライアント（ISSUE-004）
│   └── server/                        サーバ専用ロジック（後続 Issue）
├── tests/                             Vitest / Playwright（後続）
├── public/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/                     CI
└── ...
```

---

## 開発のお約束（要約）

詳細は Codex では [`AGENTS.md`](./AGENTS.md)、Claude Code では [`CLAUDE.md`](./CLAUDE.md) を参照。

- **OpenAPI が真実**: API 変更は `docs/openapi/openapi.yaml` を先に直す
- **生成物は直接編集禁止**: `src/lib/api/generated/` は再生成のみ
- **1 Issue 1 PR**: 受け入れ条件を書いてから着手
- **個人情報は出さない**: ログ・コミット・テストフィクスチャに PII を含めない
- **子どもの写真・実データをコミットしない**: テスト用も架空データで

### Codex で開発する場合

Codex は作業前に `AGENTS.md` を入口として読み、必要に応じて PRD / OpenAPI / Issue / ADR を確認する。
Hana 固有の作業を明示したいときは、個人 Codex 環境の `$hana-development` Skill を使う。
Issue を自動で Draft PR / ready_to_merge 候補まで進める場合は [`docs/api-driven-development/codex-automation-runbook.md`](./docs/api-driven-development/codex-automation-runbook.md) を参照する。

---

## ライセンス / 免責

このリポジトリは Hana 開発用のプライベートな作業領域です。子どもの写真・氏名・生年月日などの実データを含むファイルは絶対にコミットしないでください。
