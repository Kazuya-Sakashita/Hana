# AGENTS.md — Hana プロジェクト運用ルール

> このファイルは **Codex がすべての作業前に読むべきルールブック** です。
> 人間にも読みやすい形で書いてあります。実装方針・スタイル・禁止事項を更新したら、必ずここを更新してください。

---

## 0. プロジェクト概要

- **プロダクト名**: Hana（ハナ）
- **何のアプリか**: 写真1枚から AI が子どもとの記憶を物語にする育児記録アプリ
- **MVP の中核**: 写真 → AI 文章生成 → 30秒で記録完了
- **PRD**: `Hana_PRD_v1.md`（プロダクト仕様の正本）
- **API 仕様の正本**: `docs/openapi/openapi.yaml`（**Single Source of Truth**）
- **開発スタイル**: API 駆動開発 + Issue 駆動開発
- **Codex Skill**: `$hana-development`（Hana の Issue 着手・レビュー・PR 準備で使う）
- **Codex 自動開発 Runbook**: `docs/api-driven-development/codex-automation-runbook.md`
- **Loop Engineer 承認境界**: `docs/adr/0017-loop-engineer-approval-boundary.md`（ISSUE-167の人間GOまでは全mergeを人間承認で止める）

### Claude Code から Codex への読み替え

- `AGENTS.md` は Codex 用の運用正本。Codex は作業前にこのファイルを優先して読む。
- `CLAUDE.md` は Claude Code 向けに使っていた legacy ルール。ルール変更時は `AGENTS.md` を先に更新し、Claude Code でも必要な差分だけ `CLAUDE.md` に反映する。
- Claude Code 用のスキル・コマンドを移植する場合は、Codex では原則 `~/.codex/skills/<skill-name>/SKILL.md` に Skill 化する。
- Hana 固有の詳細ルールは、Codex が単独で読める入口を保ちつつ、PRD / OpenAPI / ADR / Issue へ参照でつなぐ。

---

## 1. 鉄則（Hard Rules）

絶対に守る。例外を出さない。

1. **OpenAPI は正**。実装と仕様が食い違ったら、まず `docs/openapi/openapi.yaml` を読む。
2. **API 変更は OpenAPI から書く**。実装 → openapi の順は禁止。
3. **生成物（`src/lib/api/generated/`）を直接編集しない**。必ず `pnpm openapi:gen` 経由。
4. **個人情報をログ・コミット・テストフィクスチャに含めない**。
   - 禁止: 子ども/親の氏名、生年月日、メールアドレス、画像 URL、storage_key、AI 生成本文
   - 許可: 構造化された operation 名、HTTP method/path/status、user_id ハッシュ、request_id
5. **コード変更前に影響範囲を述べる**。「このIssueは X を変更し、Y と Z に影響します」を3〜10行で。
6. **destructive な操作は事前確認**。`rm -rf`, `git push --force`, `db:reset`, ブランチ削除など。
7. **不確実なら止まる**。3回失敗したら一度報告。同じコマンドをループしない。
8. **1 Issue 1 PR**。混入禁止。

---

## 2. 標準ワークフロー

Issue 着手から PR まで、毎回この順で進める。

```
0. このIssueの docs/issues/ISSUE-XXX-*.md を読む
1. 関連する Hana_PRD_v1.md の章を読む
2. 影響しうるファイルを grep / read で確認（要点だけ）
3. 着手前の計画を 3〜10 行で出力（受け入れ条件をどう満たすか）
4. OpenAPI を更新（必要なら）
5. pnpm openapi:lint && pnpm openapi:gen
6. 実装（feature 単位で完結させる）
7. テストを書く / 走らせる
8. 動作確認手順を出力
9. Issue ファイルの frontmatter status を review に更新
10. PR 用の本文ドラフトを書く
```

---

## 3. ディレクトリ規約

```
docs/
  openapi/                       ← API 契約（真実の源）
  api-driven-development/        ← 開発フロー・ルール
  issues/                        ← Issue の永続コピー
  adr/                           ← 採用判断の記録

src/
  features/<feature>/            ← 機能スライス（api / components / hooks / view-models）
  lib/api/client.ts              ← 薄い fetch ラッパー
  lib/api/generated/             ← OpenAPI 由来の型（Git 管理する。直接編集禁止）

tests/
  contract/                      ← Schemathesis 等
  integration/                   ← request spec
  unit/
  e2e/
```

詳細: `docs/api-driven-development/README.md` を参照。

---

## 4. コードスタイル

- TypeScript strict
- 関数名: lowerCamel
- 型名: UpperCamel
- ファイル名: kebab-case
- ESLint / Prettier に従う
- **コメントはデフォルト書かない**。書くのは「なぜ」だけ。「何を」はコードと識別子が語る
- API 型は **必ず生成物から import**。手書き型を乱立させない
- 画面で使う型は `view-models/` 配下に置き、API 型から `toViewModel(...)` で変換する

---

## 5. OpenAPI 規約

- バージョン: **OpenAPI 3.1**
- パス: 小文字・複数形・ハイフン無し（例 `/v1/children`, `/v1/memories/{memoryId}`）
- operationId: `動詞 + リソース` の lowerCamel（例 `listMemories`, `createMemory`）
- schema: UpperCamel（例 `Memory`, `Child`, `ProblemDetails`）
- 日時: `format: date-time`（RFC3339 / UTC）
- ID: `format: uuid`
- ページネーション: **カーソル方式**（`limit` + `cursor`）
- 認証: `cookieSession`（Supabase SSR Cookie。ADR-0015）。公開・匿名許容・receipt cookieのエンドポイントのみ `security: []`
- **エラー応答は常に `application/problem+json` + `ProblemDetails` スキーマ**

---

## 6. エラー形式: RFC9457 Problem Details

すべてのエラーレスポンスは下記の形を返す。

```json
{
  "type": "https://hana.app/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "入力内容に誤りがあります",
  "reason": "validation_error",
  "instance": "req_01HXYZ...",
  "errors": [{ "path": "body.name", "reason": "required", "message": "必須項目です" }]
}
```

- Content-Type: `application/problem+json`
- クライアントは **`reason`（安定 ID）** でだけ分岐する。`detail` の自然文で分岐しない
- 詳細: `docs/api-driven-development/error-format.md`

---

## 7. セキュリティ・プライバシー（最優先）

子どもの写真・感情記録を扱うため、以下は **設計時点で組み込み済み**であること。

### 認証・認可

- Supabase Auth（SNS-only）を使う。Hana は password を持たない（ADR-0006）
- すべてのリソースに **user_id 所有権チェック** を行う
- 家族共有は招待 → 受諾の明示フローのみ
- 公開・匿名許容エンドポイントは OpenAPI の `security` で明示する

### 画像

- パブリック URL で公開しない
- **Presigned URL（デフォルト 30 分）** 経由でのみアクセス
- `Cache-Control: private, max-age=300` (ADR-0012、 5 分のブラウザ cache を許容)
- 表示サイズに応じた `size=thumbnail|preview|original` (ADR-0012)
- storage_key: `uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}`
- EXIF 削除は ADR-0009 に従う（MVP はクライアント Canvas、Phase 2 でサーバ側 hook）

### AI 送信

- ユーザーの **事前同意（opt-in）** が前提
- AI 送信の詳細は ADR-0011 と `docs/api-driven-development/security-and-privacy.md` を正とする
- 子どもの given name は opt-in 後に限り送信可。surname / full name / 生年月日 / メール / 住所 / raw location は送信しない
- 画像メタデータ（EXIF）を削除してから送信
- AI ベンダーの zero data retention を可能なら有効化

### ログ

- 許可リスト方式で出力フィールドを限定
- 出してよい: operation 名 / method / path / status / elapsed / user_id ハッシュ / request_id
- 出してはダメ: 氏名 / メール / 生年月日 / 画像 URL / storage_key / AI 出力本文 / リクエスト body

### 削除

- 退会 → 即時論理削除
- 30 日後に物理削除ジョブ（DB + Storage）
- AI 生成ログは匿名化

---

## 8. Issue ルール

- 1 Issue は半日〜2日で完了する粒度
- **受け入れ条件を書いてから着手**
- `docs/issues/ISSUE-XXX-*.md` の frontmatter で `priority / status / size` を管理
- ステータス: `todo → in_progress → review → done`（または `blocked`）
- PR タイトル: `[ISSUE-XXX] <要約>`
- PR 本文に `Closes #XXX`

詳細: `docs/api-driven-development/README.md` の Issue セクション。

---

## 9. テスト方針

| レイヤ       | ツール                    | 目的                              |
| ------------ | ------------------------- | --------------------------------- |
| OpenAPI Lint | `redocly` + `spectral`    | 仕様が壊れていない                |
| 型生成差分   | `openapi-typescript` + CI | 生成漏れを検知                    |
| 契約テスト   | `schemathesis`            | 実装が OpenAPI に準拠             |
| 単体         | `vitest`                  | 純粋関数 / ViewModel 変換         |
| 結合         | `vitest` + supertest      | 主要シナリオ + 認可               |
| E2E          | `playwright`              | golden path（写真→AI→保存）       |
| AI 出力      | カスタム                  | 性質テスト（氏名漏洩・NG ワード） |
| セキュリティ | カスタム                  | ログ PII / Presigned 期限         |

---

## 10. トークン浪費・長時間停止を防ぐ

- 一度読んだファイルを再度全文読まない（`offset/limit` で必要な行だけ）
- 巨大ログを貼り直さない（要約 + 該当行のみ）
- 独立操作は並列実行（read / grep / lint をまとめて 1 ターン）
- 計画は短く 3〜10 行
- 同じコマンドを 3 回失敗したら止まって報告
- 「やってみる」前に「これからこれをします」を 1 文

---

## 11. 実装前チェックリスト（毎回）

- [ ] Issue の目的を 1 文で言えるか
- [ ] PRD の該当章を確認したか
- [ ] OpenAPI 更新が必要か / 先に更新したか
- [ ] 影響範囲を列挙したか
- [ ] 認可チェックは設計に含まれるか
- [ ] PII を扱う場合、ログ・AI 送信のマスキング方針は決まったか
- [ ] 受け入れ条件はテスト可能な形か
- [ ] 半日〜2日のサイズか
- [ ] ブランチを切ったか（`feat/ISSUE-XXX-...`）

---

## 12. 実装後チェックリスト（毎回）

- [ ] `pnpm openapi:lint` が通る
- [ ] `pnpm openapi:gen` 実行済み・差分コミット済み
- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test` が通る
- [ ] 認可テスト：他ユーザーで 403 を確認
- [ ] ログに PII が含まれない（目視 + テスト）
- [ ] AI 送信は ADR-0011 に準拠している（child given/display name は opt-in 後のみ可。full name / surname / 生年月日 / メール / 住所 / raw location は不可）
- [ ] 画像が公開 URL に漏れない
- [ ] 破壊変更を含む場合、`oasdiff` 実行 + ADR 追加
- [ ] Issue の受け入れ条件すべてチェック済み
- [ ] PR 本文に Closes #XXX / 変更点 / テスト結果 / 動作確認手順

---

## 13. 参考ドキュメント

- `Hana_PRD_v1.md` — プロダクト仕様（ビジネス側の真実）
- `docs/openapi/openapi.yaml` — API 仕様（技術側の真実）
- `docs/api-driven-development/README.md` — 開発フロー詳細
- `docs/api-driven-development/codex-automation-runbook.md` — Codex 自動開発手順
- `docs/api-driven-development/error-format.md` — RFC9457 設計
- `docs/api-driven-development/openapi-style-guide.md` — OpenAPI 命名規約
- `docs/api-driven-development/security-and-privacy.md` — セキュリティ詳細
- `docs/adr/` — アーキテクチャ判断記録
- `docs/issues/` — Issue の永続コピー
- `docs/perf/` — パフォーマンスベースラインと計測手引き

---

## 14. メモ：Codex 起動時の最初の動作

新しい Issue に着手するときは、このファイルに加えて以下を順に読むこと:

1. `docs/issues/ISSUE-XXX-*.md`（着手対象）
2. `docs/api-driven-development/README.md`（フロー再確認）
3. `Hana_PRD_v1.md` の該当章
4. `docs/openapi/openapi.yaml`（API 影響がある場合）

そのうえで、3〜10 行の着手計画を出力してから作業を始める。

明示的に Skill を使う場合は、依頼文に `$hana-development` を含める。例:

```text
Use $hana-development to start ISSUE-023.
```
