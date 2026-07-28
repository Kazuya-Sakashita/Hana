---
id: ISSUE-117
title: AI生成文の安全性検証と限定自動再生成を追加する
priority: P0
status: review
size: M
created_at: 2026-07-28
github_issue: 252
blocked_by: []
requires_human_review:
  - AI Safety
  - Privacy
---

# ISSUE-117: AI生成文の安全性検証と限定自動再生成を追加する

## 目的 (Why)

PRD §9で禁止している明示的な表現をAI生成文の表示前に検出し、不適切な下書きをユーザーへ返さない。完全な意味判定ではなく、合成データで再現できる高精度なカテゴリに限定する。

## スコープ (What)

- 生成結果を安定したカテゴリIDで検証する出力ポリシーを追加する
- 初回出力がポリシー違反の場合だけ、内部で1回再生成する
- 2回目も違反した場合は本文を返さず、`ai_output_rejected`のProblem Detailsを返す
- ポリシーイベントにはカテゴリID、試行回数、処理結果だけを記録する
- ポリシーメタデータは`ai_generations`に限定し、一般ログには出さない
- vendor呼び出しに到達した失敗requestも月間quotaに含める
- 正常、長さ違反、禁止表現、再生成成功、再生成失敗を合成データで検証する

## やらないこと (Out of Scope)

- 全ての誤推測やハルシネーションの完全検出
- 別AIモデルによる自動審査
- 実ユーザーの生成文、prompt、画像情報の保存
- プロンプトの全面改修
- ユーザー操作による再生成回数の制御

## 影響範囲

- `docs/openapi/openapi.yaml`
- `docs/openapi/components/responses/AiGenerateUnprocessableEntity.yaml`
- `src/lib/api/generated/schema.d.ts`
- `src/features/ai/server/output-policy.ts`
- `src/features/ai/server/generate.ts`
- `src/app/v1/ai/generate/route.ts`
- `src/server/api/problems.ts`
- `prisma/schema.prisma`とAI安全メタデータmigration
- AI生成の単体・結合テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] 生成結果を返す前にカテゴリID付きの出力ポリシー検証が実行される
- [x] 違反時の内部自動再生成は最大1回で停止する
- [x] 再失敗時は不適切な本文を表示せず、手動入力可能な回復導線へ戻れる
- [x] ログとDBにはカテゴリIDと処理結果だけを残し、prompt・生成本文・画像情報を残さない
- [x] 正常、長さ違反、禁止表現、再生成成功、再生成失敗を合成データでテストする
- [x] OpenAPIに`ai_output_rejected`を先行定義し、生成型を更新する
- [x] `pnpm pr:gate`と`git diff --check`が通る

## セキュリティ・プライバシー考慮

- ポリシーメタデータは型付き許可リスト方式とし、カテゴリID、試行回数、処理結果だけを保存する
- カテゴリID、試行回数、処理結果はアクセス制御された`ai_generations`にだけ保存し、
  一般ログへ出力しない
- AIの応答本文、prompt、base64画像、画像URL、`storage_key`をログや新規fixtureへ含めない
- クライアントへ違反カテゴリを返さず、安定reasonだけを返す
- 判定ルールは安全網であり、意味上の誤推測を完全に検出するものではない

## 検証

- [x] `pnpm openapi:lint`
- [x] `pnpm openapi:gen`
- [x] focused unit / integration tests（5 files / 61 tests）
- [x] `pnpm pr:gate`（89 files / 708 tests）
- [x] `git diff --check`

## 専門レビュー

- AI Safety: 3巡目で承認
- Privacy / PII: 3巡目で承認
- Backend / Concurrency: 3巡目で承認

## 参考

- GitHub Issue #252
- `Hana_PRD_v1.md` §9
- `docs/adr/0011-ai-generation.md`
