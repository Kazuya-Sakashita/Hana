# ADR-0011: AI 文章生成の統合方針 (Claude API)

- 状態: Accepted
- 決定日: 2026-05-23
- 対象 Issue: ISSUE-010

## 背景

Hana の差別化の核心は「写真 1 枚から AI が記憶を物語にする」(PRD §1)。
本 ADR では、その実装方針を明文化する:

- どの AI プロバイダ・モデルを使うか
- PII (子どもの名前・誕生日) をプロンプトにどう含めるか
- 月次 quota の設計
- 禁止表現の制御
- 生成ログの保管範囲

## 決定

### 1. プロバイダ: Anthropic Claude (直接 SDK)

採用: `@anthropic-ai/sdk` で直接呼び出し。

代替案:

- **Vercel AI Gateway** — Vercel deploy 時に有用 (provider failover / observability)。ただし Hana はまだ Vercel に乗せていない。ISSUE-023 (Vercel 設定) で再検討
- **AI SDK v6 + provider** — 抽象化は強いが、MVP に複雑性を持ち込む価値が薄い

### 2. モデル: `claude-haiku-4-5` を default

理由:

- 速さ + コスト効率 (haiku は sonnet/opus の数分の 1)
- 育児記録の温かい文章には haiku で十分な品質
- 月 20 回 × 想定ユーザー 1,000 人 = 月 20,000 回 でコスト試算: ~$10〜30

切替: `.env.local` の `AI_MODEL` で上書き可能。品質に不満があれば sonnet-4.6 へ。

### 3. プロンプト構造: system + user + image (base64)

```
system: PRD §9 の方針 + 禁止表現 + JSON 出力指示
        ↑ prompt cache (ephemeral 5min) で input トークンを 90% 削減
user:   子どもの名前・月齢・天気・親のひとこと
        + 画像 (base64) を 1〜5 枚
```

- system prompt は **stable** (PROMPT_VERSION 管理) → cache 効果大
- user prompt は毎回異なる
- 画像は Storage から service_role で取得 → base64 化 → 送信

### 4. PII 守護策

CLAUDE.md §7 と PRD §9 の整合:

| データ                | 送る? | 理由                                                          |
| --------------------- | ----- | ------------------------------------------------------------- |
| 子どもの given name   | ✅    | 温かい文章に必須 (PRD §9)。surname は Hana が保管しない       |
| 月齢 (○ヶ月と○日)     | ✅    | 描写の温度に必須。**誕生日そのものは送らない** (CLAUDE.md §7) |
| 撮影日 (YYYY-MM-DD)   | ✅    | 季節感の判断に必須                                            |
| 天気                  | ✅    | 任意。文章のトリガー                                          |
| 親のひとこと          | ✅    | 任意。AI へのヒント                                           |
| 写真 (base64)         | ✅    | 必須。EXIF はクライアント Canvas で事前削除済 (ADR-0009)      |
| 親の email / 親の名前 | ❌    | 絶対送らない (DB の Profile からも参照しない)                 |
| 子どもの birthdate    | ❌    | 月齢に変換して送る (タイムゾーン不整合の防止も兼ねる)         |
| 住所 / 位置情報       | ❌    | Hana には保管されていない                                     |

実装: `src/features/ai/server/prompt.ts` の `buildUserPrompt` が **計算済みの月齢のみ** 受け取る。
誕生日を直接渡すパスを設けないことで、PII を構造的に分離。

### 5. 月次 quota: Free tier 20 回

PRD §16 マネタイズ:

- Free: 20 回 / 月
- Plus: 無制限 (ISSUE-019 で実装)

実装:

- `ai_generations` テーブルで `(user_id, created_at, succeeded=true)` をカウント
- UTC 月境界 (1 日 00:00:00) でリセット
- 失敗した generation は quota にカウントしない (kazuya が AI のエラーで loss しないように)

### 6. 禁止表現の制御: system prompt のみ (MVP)

system prompt に PRD §9 の禁止リストを明記。Claude は通常従う。

将来 (違反観測時): post 生成後の regex フィルタ + 自動再生成を追加 (別 ISSUE)。

### 7. 生成ログ: メタ情報のみ、本文は保管しない

`ai_generations` テーブルには以下を保管:

- model_version / prompt_version
- input_tokens / output_tokens / duration_ms
- succeeded (boolean) / error_reason
- user_id / child_id / created_at

**保管しない**:

- 生成された title / body 自体 (PII / 容量)
- プロンプト本文 (PII)
- 子どもの名前 (PII)

CLAUDE.md §7 のログ禁止リストに準拠。

### 8. AI 同意 (opt-in)

- `profile.ai_consent_at` が null の場合 `POST /ai/generate` は 403 `ai_consent_required`
- クライアントは 403 を受けたら同意ダイアログを表示
- 同意時に `POST /me/ai-consent` で `ai_consent_at = now()` セット
- idempotent: 既に同意済みなら時刻を更新しない

### 9. HEIC 画像のハンドリング

Claude API は HEIC を直接受け付けない (JPEG / PNG / WebP / GIF のみ)。

実装:

- `/record` の Canvas 再エンコードで HEIC → JPEG に自動変換 (Safari 限定)
- それでも HEIC が `images.content_type` に入っていたら 422 `media_type_not_supported_for_ai`
- 将来 (v1): server 側で sharp で HEIC → JPEG 変換 (Vercel Functions の binary deps 問題を解いてから)

### 10. タイムアウト

Claude haiku の応答時間: 通常 3〜8 秒、最悪 15〜20 秒。

`maxDuration = 60` (Vercel Functions の default 300s より短く、UI 上は「30秒以内」の体験を担保)。

クライアントは pending 中に「○○ちゃんの ページを、つくっています…」を表示。

## 受容コスト

- **prompt 改善のサイクルが手間**: PROMPT_VERSION を bump して新旧比較する仕組みは未整備。違反観測時に判断
- **画像 size による input トークン増**: 大きい画像は input token を食う。ADR-0009 で 10 MiB 上限なので最悪ケースで ~5,000 tokens。許容範囲
- **HEIC ユーザーが詰む**: iPhone デフォルト形式の HEIC を直接送る経路があると詰む。Canvas re-encoding でほぼ防げるが、Safari 以外のブラウザでは画像非対応扱い
- **タグの活用が後手**: 生成された tags は今は使われない。将来の検索 ISSUE で活用

## 関連

- ISSUE-010: AI 文章生成 (本Issue で起こす)
- ADR-0009: Storage (presigned URL / EXIF クライアント責務)
- `Hana_PRD_v1.md` §9 (AI 機能仕様) / §16 (マネタイズ)
- `CLAUDE.md` §7 (PII / ログ禁止リスト)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
