---
id: ISSUE-010
title: AI 文章生成統合 (Claude API)
priority: P0
status: review
size: M+
created_at: 2026-05-23
---

## 目的 (Why)

PRD §1 の中核「写真 1 枚から AI が記憶を物語にする」を完成させる。
ISSUE-009 で実装した /record フローの本文ステップを **AI 提案に置き換える** ことで、
30 秒記録の魔法体験が成立する。

---

## スコープ (What)

### OpenAPI

- [ ] `POST /ai/generate` — 画像 + 子ども + 天気 + 親メモ → title / body / tags
- [ ] `POST /me/ai-consent` — `profile.ai_consent_at` セット (idempotent)
- [ ] AiGenerateRequest / AiGenerateResponse schema
- [ ] error responses: 401 / 403 (`ai_consent_required`) / 404 / 422 / 429 (`ai_quota_exceeded`) / 500

### Server

- [ ] `src/lib/ai/client.ts` — Anthropic SDK init (default `claude-haiku-4-5`)
- [ ] `src/features/ai/server/prompt.ts`
  - SYSTEM_PROMPT (PRD §9 ベース・禁止表現 + JSON 出力指示)
  - buildUserPrompt (PII 守護: 月齢のみ、誕生日は渡さない)
  - computeAge (birthdate + recorded_at → months/days)
  - PROMPT_VERSION (v1)
- [ ] `src/features/ai/server/generate.ts`
  - Claude messages API 呼び出し (prompt cache 有効)
  - JSON 抽出 + 検証
  - HEIC 等の非対応 MIME を弾く
- [ ] `src/features/ai/server/quota.ts` — UTC 月境界での Free tier 20 回チェック
- [ ] `src/features/ai/server/parse.ts` — body validation
- [ ] `src/app/v1/ai/generate/route.ts`
  - 同意・quota・child 所有権・image 所有権 検証
  - Storage admin client で画像 fetch → base64 → Claude
  - 成功/失敗ともに `ai_generations` にメタ情報のみ記録 (本文は保管しない)
- [ ] `src/app/v1/me/ai-consent/route.ts` — idempotent 同意セット

### DB (Prisma)

- [ ] `AiGeneration` model + migration `add_ai_generations`
  - id / user_id (FK Cascade) / child_id / model / prompt_version / succeeded / input_tokens / output_tokens / duration_ms / error_reason / created_at
  - `(user_id, created_at)` index for quota query
  - **生成本文は保管しない** (CLAUDE.md §7 / ADR-0011 §7)

### UI

- [ ] `/record` に「**AI で つくる**」ボタン追加
  - 写真アップロード完了後に活性化
  - 押下 → ai_consent_at が null なら同意ダイアログ → 同意後に自動リトライ
  - 生成中: 「○○ちゃんの ページを、つくっています…」
  - 完了: title + body にプレースメント (編集可能のまま)
  - quota 超過時: amber メッセージ「らいげつ また つかえます」
- [ ] 同意ダイアログ (`AiConsentDialog`)
  - 「あなたの しゃしんを、ことばに します」
  - 「なまえと月齢は おくります、たんじょうびと じゅうしょは おくりません。学習にも つかわれません。」
  - 「どういして、つくる」 / 「AI を つかわない」
- [ ] `POST /memories` の `ai_generated` フラグを送信時の状態に応じてセット

### テスト (新規 35+ 件)

- [ ] `tests/unit/features/ai/prompt.test.ts` — SYSTEM_PROMPT に禁止表現が入っている / buildUserPrompt が PII を含まない / computeAge の境界条件
- [ ] `tests/unit/features/ai/parse.test.ts` — body validation
- [ ] `tests/unit/features/ai/generate.test.ts` — JSON parse / code fence / tag filter
- [ ] `tests/unit/features/ai/quota.test.ts` — UTC 月境界 / 上限判定
- [ ] `tests/integration/v1/ai-generate.test.ts` — 401/403/404/422/429/500/200 を網羅

### ドキュメント

- [ ] ADR-0011: AI 統合方針 (Provider / PII / quota / 禁止表現 / 同意 / HEIC)
- [ ] このIssueファイル

### kazuya 側の手動セットアップ

- [ ] `.env.local` に `ANTHROPIC_API_KEY=sk-ant-api03-...` を設定 (済)
- [ ] (任意) `AI_MODEL=claude-haiku-4-5` を設定 (default も同じ)
- [ ] `pnpm db:migrate` で `ai_generations` テーブル適用

---

## やらないこと (Out of Scope)

- **複数モデル切替** (sonnet/opus への動的切替) → 別 ISSUE
- **ストリーミング表示** — シンプルな同期生成で十分
- **再生成回数の細かい制御** — 月 20 回上限のみ
- **post 生成後の禁止表現フィルタ** → 違反観測時に追加
- **タグの検索利用** → 検索 ISSUE
- **AI 生成本文の audit ログ** → PII / 容量の懸念で保管しない (ADR-0011 §7)
- **HEIC → JPEG サーバ変換** → クライアント Canvas で対応済 (sharp は Vercel binary 問題で後回し)
- **Vercel AI Gateway 移行** → ISSUE-023 で再検討
- **Plus tier 無制限化** → ISSUE-019 (Premium)
- **画像複数アップロード対応** (MVP は 1 枚) → /record の UI 拡張で別 ISSUE

---

## 設計判断

詳細は **ADR-0011**。要点:

- **直接 Anthropic SDK + claude-haiku-4-5**
- **PII 分離**: 月齢のみ渡す、誕生日は渡さない
- **UTC 月境界 quota**: 20 回 / month / Free tier
- **system prompt cache**: 5min ephemeral で input 90% 削減
- **生成本文は audit に残さない**: メタ情報のみ
- **HEIC は 422 で弾く**: Canvas 再エンコードで殆ど防げる
- **opt-in は idempotent な専用エンドポイント**: `POST /me/ai-consent`

---

## 影響範囲

| 領域         | 影響                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| OpenAPI      | AiGenerateRequest/Response schema + 2 paths (/ai/generate, /me/ai-consent) |
| 生成型       | `paths['/ai/generate']`, `paths['/me/ai-consent']` 等                      |
| データ       | `ai_generations` テーブル新規 + `profiles.ai_generations` リレーション     |
| 画面         | `/record` に AI ボタン + 同意ダイアログ追加 (機能拡張、既存フロー無変更)   |
| 認証         | 既存 `requireUser` を使用                                                  |
| 認可         | child / image の userId 所有権チェック                                     |
| CI           | typecheck / lint / format / build / test 全グリーン                        |
| ドキュメント | ADR-0011 + このIssueファイル                                               |
| 環境変数     | **新規**: `ANTHROPIC_API_KEY` (必須)、`AI_MODEL` (任意・default haiku)     |
| 外部依存     | `@anthropic-ai/sdk` を runtime dep に追加                                  |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `pnpm openapi:all` グリーン
- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 既存 151 + 新規 35+ = 186+ 件パス
- [ ] `pnpm db:migrate` で `ai_generations` テーブル作成 (手動)
- [ ] `.env.local` に `ANTHROPIC_API_KEY` 設定済 (手動)
- [ ] /record で「AI で つくる」ボタンが活性化される (アップロード完了後)
- [ ] 初回押下時に同意ダイアログが出る → 同意 → 自動で生成される
- [ ] 生成成功時に title + body がフォームに反映される (編集可能のまま)
- [ ] 生成失敗時に amber エラーメッセージが出る
- [ ] 月 20 回超過時に「らいげつ また つかえます」が出る
- [ ] 認可エラー (他人 child / image) → 403
- [ ] ai_generations テーブルに **メタ情報のみ** 保存される (生成本文は無い)
- [ ] ADR-0011 accepted

---

## セキュリティ・プライバシー考慮

- [ ] **opt-in 必須**: `ai_consent_at` 未セットで叩くと 403
- [ ] **PII 分離**: 月齢のみ送信、誕生日 / 住所 / email は絶対送らない (prompt.ts で構造的に防ぐ)
- [ ] **生成本文をログ・DB に残さない** (CLAUDE.md §7)
- [ ] **service_role key** で Storage から画像取得、user JWT には Storage 権限を渡さない (既存方針)
- [ ] **API key の server-only**: `@/lib/ai/client.ts` は 'server-only' import
- [ ] **prompt cache の TTL**: ephemeral (5min)。長期保管されない
- [ ] **Anthropic の zero data retention**: 別途 Anthropic Console でテナント設定 (kazuya が手動)
- [ ] **HEIC を弾く**: Claude 非対応形式を 422 で明示エラー

---

## 動作確認手順

```bash
# 1. .env.local に ANTHROPIC_API_KEY を設定 (済)
# 2. migration
pnpm db:migrate

# 3. dev
pnpm dev

# 4. ブラウザフロー
#    /sign-in → Google → /record
#    写真選択 → アップロード完了
#    「AI で つくる」ボタンが活性化
#    押す → 同意ダイアログ → 「どういして、つくる」
#    「○○ちゃんの ページを、つくっています…」が 5〜10 秒
#    タイトル + 本文に AI ていあんが入る
#    必要なら手で編集 → 「のこす」
#    /album で AI 生成記録が並ぶ

# 5. quota 超過テスト (任意): ai_generations に 20 件挿入してから /ai/generate を叩く
#    → 429 ai_quota_exceeded

# 6. 同意取消 (任意): DB で profile.ai_consent_at = null に戻す
#    /record で「AI で つくる」→ 同意ダイアログ再表示
```

---

## 参考

- ISSUE-006 (Auth) / 007 (Children) / 008 (Storage) / 009 (Memory)
- `Hana_PRD_v1.md` §1 (プロダクト定義) / §9 (AI 機能) / §16 (マネタイズ)
- `CLAUDE.md` §7 (PII / ログ禁止)
- ADR-0009 (Storage / EXIF) / **ADR-0011 (本Issue)**
- `docs/design/v0-prompt.md` §5.3 (記録作成 + AI 生成 UX) / §5.13 (AI 同意ダイアログ)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
