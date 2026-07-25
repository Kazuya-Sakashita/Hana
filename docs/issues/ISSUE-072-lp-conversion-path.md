---
id: ISSUE-072
title: LP の実行可能な CV 導線を決めて接続
priority: P0
status: done
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 163
blocked_by: []
external_blockers: []
requires_human_review:
  - product
  - privacy
---

## 目的 (Why)

LP が「読んで終わり」にならないよう、Hero と final CTA から実行可能な CV 導線へ進める状態にする。

PRD では LP の目的が価値訴求とダウンロード誘導であり、現在の静的 prototype の Store 準備表示だけでは CV 検証に使えない。
公開前検証フェーズでは、人間判断により Primary CTA を `待機リスト登録` とし、正式リリース後に Store ダウンロードへ切り替える。

## スコープ (What)

- 待機リスト登録を公開前検証の primary CTA として接続する
- Hero、final CTA、nav、Store 表示の文言を統一する
- CTA が自己リンクや準備表示だけで終わらない状態にする
- メールアドレスの取得目的、保存先、privacy / consent / logging の扱いを明記する
- `/v1/waitlist` の OpenAPI 契約、保存先、Route Handler、テストを追加する
- 未ログインの `/` を公開 LP (`/lp`) に接続し、ログイン済みの app home は維持する

## やらないこと (Out of Scope)

- 決済導線
- 本番 Store 公開作業
- 実ユーザーのメールや個人情報を証跡に残すこと
- Privacy Policy 本文の法務確定

## 受け入れ条件 (Acceptance Criteria)

- [x] LP の primary CTA が実行可能な導線に接続されている
- [x] secondary CTA が `記録例を見る` など価値理解に接続している
- [x] CTA のリンク先、入力項目、保存先、ログ方針が説明されている
- [x] 個人情報を取得する場合、プライバシー説明と同意の扱いを安全側ドラフトとして明記し、最終 human privacy / legal review を ISSUE-075 に残している
- [x] CV 導線の QA 手順が `docs/design/current-lp-evaluation.md` または関連 QA doc に追記されている

## Blocked by

- なし

## 実装メモ

- Primary CTA: `待機リストに登録する`
- Secondary CTA: `記録例を見る`
- API: `POST /v1/waitlist`
- 入力項目: `email`, `consent`, `source`, `privacy_policy_version`
- 保存先: 認証・アクセス制御された DB (`waitlist_signups` table)。Supabase Postgres を想定する。
- 重複方針: 正規化メールアドレスの HMAC-SHA256 (`email_hash`) で重複登録を upsert する。production では `WAITLIST_EMAIL_HASH_PEPPER` 必須。
- メタデータ方針: `source` と `privacy_policy_version` は既知値のみ受け付け、未知フィールドは 422 で拒否する。
- レスポンス方針: `202 { "status": "accepted" }` のみ。メール、内部 ID、メールハッシュは返さない。
- ログ方針: `operation`, `status`, `source`, `privacyPolicyVersion`, `level`, `ts` の allowlist のみ。メール、メールハッシュ、内部 ID、未知フィールドは出さない。
- 乱用対策: 短時間の同一 client key 連続送信は 429 にする。公開直前の本格的なBot対策は `ISSUE-075` の QA gate で確認する。
- 利用目的: 待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限定する。
- Trust copy: 安全側のドラフトとして、AI/保存/削除/学習利用に関する未確定 claim は断定しない。
- 人間判断: 公開前検証フェーズの Primary CTA を `待機リスト登録` とする。正式リリース後に Store ダウンロードへ切り替える。
- Privacy / legal: 今回は安全側ドラフトと導線設置まで。公開 traffic 前の最終 review は `ISSUE-075` の gate とする。
- Public route: 未ログインの `/` は `/lp` に遷移する。`/lp` では 3 段 proof、待機リスト form、privacy link、no-JS fallback を表示する。
- Evidence policy: OpenAPI example、tests、LP placeholder からメール形リテラルと内部 ID 例を除去した。

## 公開有効化前の運用ゲート

- staging / production に `WAITLIST_EMAIL_HASH_PEPPER` を設定する。
- `waitlist_signups` migration を disposable DB または staging で適用確認する。
- `/privacy` は安全側ドラフト。問い合わせ先、配信停止、削除依頼、メール配信基盤の扱いは `ISSUE-075` で human privacy / legal review を通す。
- 公開 traffic に載せる前に、provider / edge 側の rate limit または Bot 対策を `ISSUE-075` で確認する。

## セキュリティ・プライバシー考慮

- メールアドレスは待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限定して扱う
- LP にプライバシーポリシー導線を設置し、取得目的と管理方法を明記する
- 証跡にメール、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- 構造化ログと API レスポンスにメール、メールハッシュ、内部 ID を含めない

## 検証

- [x] `pnpm openapi:lint`
- [x] `pnpm openapi:gen`
- [x] `pnpm db:generate`
- [x] `pnpm exec vitest run tests/unit/app/prelaunch-lp-route.test.ts tests/unit/features/waitlist/parse.test.ts tests/integration/v1/waitlist.test.ts tests/unit/app/lp-static-prototype-review.test.ts tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/bottom-nav-action-icon-alignment.test.ts`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                 | verdict | notes                                                                                                                    |
| ----- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | Privacy / Trust / PII    | HOLD    | tests / OpenAPI example / LP placeholder にメール形文字列と内部 ID 例が残っていた                                        |
| 1     | Backend / API / Data     | GO      | OpenAPI-first、ProblemDetails、DB unique/upsert、Retry-After、production env gate は妥当。rate limit 強化は ISSUE-075 残 |
| 1     | Frontend / Accessibility | HOLD    | PR head 未更新、production `/lp` 未接続、public route の 3 段 proof / noscript / error 分岐が不足                        |
| 2     | Privacy / Trust / PII    | GO      | waitlist 差分からメール形文字列と内部 ID 例を除去。response / log / UI への PII 反射なし                                 |
| 2     | Frontend / Accessibility | GO      | public `/lp`、3 段 proof、noscript、429/5xx 分岐を追加。追加 P1 blocker なし。push 後に PR mergeability / CI を確認      |

## 参考

- `Hana_PRD_v1.md`
- `docs/design/current-lp-evaluation.md`
- `docs/openapi/openapi.yaml`
- `src/app/v1/waitlist/route.ts`
