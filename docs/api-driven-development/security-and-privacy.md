---
title: Hana セキュリティ・プライバシー運用ガイド
last_updated: 2026-07-21
owner: kazuya
---

# Hana セキュリティ・プライバシー運用ガイド

Hana は子どもの写真、育児記録、AI 送信を扱う。
この文書は MVP 開発で Codex / 人間が毎回参照する security / privacy の正本であり、release 前に何を blocker として止めるかを明確にする。

## Source Of Truth

判断が矛盾した場合は、次の順で優先する。

1. `docs/openapi/openapi.yaml` — API の公開範囲、security、schema、エラー応答
2. `docs/adr/` — 採用済みの設計判断
3. この文書 — MVP の運用チェック、accepted risk、release blocker
4. `AGENTS.md` — Codex の作業ルール
5. `Hana_PRD_v1.md` — プロダクト要求。古い前提は ADR で上書きされる
6. `CLAUDE.md` — Claude Code 向けの legacy 入口。Codex では `AGENTS.md` を優先

Known superseded / clarified items:

| old statement                         | current source     | current rule                                                                                                                  |
| ------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| PRD の email+password / 自前 auth API | ADR-0006           | Supabase Auth + SNS-only。email+password は MVP で持たない                                                                    |
| 公開 API は `/v1/auth/*` のみ         | OpenAPI / ADR-0006 | Supabase auth routes are outside Hana v1 API。Hana v1 の明示例外は `/v1/health` と `/v1/metrics/vitals`                       |
| AI に子どもの名前を送らない           | ADR-0011           | opt-in 後、given name と月齢は送信可。birthdate / surname / email / address / raw location は送信禁止                         |
| 写真は外部 AI へ送らない              | ADR-0011           | opt-in 後に Anthropic Claude へ画像を送る。training 利用・保持条件は人間確認 gate                                             |
| AI 学習不使用 / ZDR を UI で断定      | ISSUE-048          | active UI は ZDR や契約確認前の training non-use を断定しない。公式証跡は `docs/design/ai-consent-privacy-evidence.md` に記録 |
| `Cache-Control: private, no-store`    | ADR-0012           | signed URL response は `private, max-age=300`                                                                                 |
| EXIF はサーバ側で削除                 | ADR-0009           | MVP はクライアント Canvas 再エンコードで削除。サーバ側削除は Phase 2                                                          |
| 退会フロー ISSUE 番号                 | ADR-0009           | ADR 内の `ISSUE-016` は古い参照。現在の ISSUE-016 は perf baseline                                                            |

## Data Classification

| data                    | classification                   | storage / logging rule                                                                                                                 |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| child given name        | PII                              | DB 保存可。ログ禁止。AI 送信は opt-in 後、ADR-0011 の範囲のみ                                                                          |
| child birthdate         | PII                              | DB 保存可。AI には月齢へ変換して送る。ログ禁止                                                                                         |
| parent email            | PII                              | Supabase Auth / profile で扱う。ログ・AI 送信禁止                                                                                      |
| child photo             | highly sensitive                 | private bucket。public URL 禁止。AI 送信は opt-in 後のみ                                                                               |
| presigned URL           | secret-like temporary credential | API response 以外に出さない。ログ・PR・スクリーンショット禁止                                                                          |
| storage_key             | secret-like internal locator     | normal UI response / log / PR 証跡に出さない                                                                                           |
| AI generated title/body | sensitive user content           | memory として保存可。AI generation log / PR / test fixture へ貼らない                                                                  |
| AI generation metadata  | operational                      | user_id / child_id / model / prompt version / token count / duration / reason / created_at は保存可。prompt 本文と生成本文は保存しない |
| Web Vitals payload      | anonymous operational            | allowlist の metric fields のみ。URL query や user text を入れない                                                                     |

## Auth And Authorization

- Auth provider は Supabase Auth。MVP は Google 先行、Apple は後続有効化。
- Hana は password を持たない。password reset、bcrypt、独自 refresh token は実装しない。
- Route Handler は最初に `requireUser()` を呼ぶ。公開・匿名許容 endpoint は OpenAPI に明示する。
- private resource access は `requireOwnership(currentUserId, resourceUserId)` 相当の所有権確認を通す。
- RLS は Phase 2。MVP は Route Handler 層の認可とテストで担保する。
- 403 / 404 の扱いは `docs/api-driven-development/error-format.md` §7 に従う。

Current public / anonymous exceptions:

| endpoint                  | auth policy         | reason                                |
| ------------------------- | ------------------- | ------------------------------------- |
| `GET /v1/health`          | public              | uptime check                          |
| `POST /v1/metrics/vitals` | bearer or anonymous | RUM beacon can be sent before sign-in |

## Image Security

- Storage は Supabase Storage private bucket。
- public URL は使わない。upload / download は signed URL 経由。
- `storage_key` は `uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}`。
- normal API response は `storage_key` を返さない。UI は `image.id` から download URL を取得する。
- upload signed URL は Supabase の既定 TTL。download signed URL は 30 分。
- download URL endpoint は `Cache-Control: private, max-age=300`。
- image size は `thumbnail` / `preview` / `original` を使い分ける。
- EXIF 削除は MVP ではクライアント Canvas 再エンコードを前提にする。これは accepted risk として扱う。

## AI Privacy

- `POST /v1/ai/generate` は `profile.ai_consent_at` が無い場合 403 `ai_consent_required`。
- Anthropic Claude に送るデータは ADR-0011 の範囲だけにする。
- 送信可: child given name、計算済み月齢、撮影日、天気、親のひとこと、EXIF 削除済み写真。
- 送信禁止: parent email、parent name、surname / full name、birthdate、生年月日、住所、raw location、storage_key、presigned URL。
- generation log は user_id / child_id / model / prompt version / token / duration / success / error reason / created_at まで。prompt 本文と生成本文は保存しない。
- prompt 本文と生成本文は AI log に保存しない。
- vendor retention / zero data retention / training non-use の公開文言は `docs/design/ai-consent-privacy-evidence.md` を入力に、
  release 前の人間 privacy / legal review gate とする。

## Logs And Monitoring

Logs are allowlist-based.

Allowed:

- operation name
- HTTP method / path / status
- elapsed time
- request_id / ProblemDetails `instance`
- user_id hash
- Web Vitals metric name / value / route
- AI metadata: model, prompt version, token counts, duration, stable error reason

Forbidden:

- request / response body
- child or parent name
- email
- birthdate
- image URL / presigned URL
- storage_key
- AI generated title/body
- prompt text
- raw location
- cookie / bearer token / service role key

ProblemDetails may expose `detail` to users, but server logs should branch on stable `reason` and avoid copying free-form PII.

## Deletion And Retention

- Memory delete is logical delete (`deleted_at`) per ADR-0010.
- Profile / account deletion must remove DB rows and Storage objects. This is not fully proven for release until a dedicated deletion flow and smoke exist.
- AI generation logs are metadata-only and may be retained for quality / quota analysis.
- Orphan upload files can occur when signed upload succeeds but confirm is not called. Cleanup is future work and an accepted risk until public release.

## MVP Accepted Risks

| risk                                           | why accepted for MVP                                        | mitigation                                                  |
| ---------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| RLS not enabled                                | keeps Prisma / Route Handler implementation simple          | ownership tests, code review, future RLS ADR                |
| EXIF removal depends on client path            | server hook adds storage download / transform / upload cost | Canvas re-encode, AI/image human review                     |
| upload signed URL TTL is Supabase default      | SDK does not expose TTL control                             | private bucket, storage_key validation, confirm ownership   |
| orphan uploaded files                          | upload and confirm are intentionally separate               | future cleanup job, no public URL                           |
| 5 minute browser cache for signed URL          | needed for mobile performance                               | `private`, TTL below signed URL lifetime, clear on sign-out |
| AI vendor sends child photo outside Hana infra | core product value depends on AI vision                     | explicit opt-in, privacy policy, vendor retention review    |

## Pre-Release Blockers

These require implementation, documented waiver, or human decision before public MVP release.
The waiver path applies only to planned release risks. Hard-rule incidents, especially real child data or secret-like credentials in repo artifacts, are not waivable and must be cleaned before merge.

| blocker                                                                         | required decision              |
| ------------------------------------------------------------------------------- | ------------------------------ |
| privacy policy / terms for AI image sending not reviewed                        | human privacy review           |
| Anthropic data retention / training-use copy not privacy-reviewed               | human privacy / legal review   |
| App Store privacy label not drafted                                             | human release review           |
| any private Route Handler lacks required ownership tests or documented coverage | engineering review             |
| deletion flow does not remove Storage objects or accepted waiver is absent      | security / release review      |
| production logs can include body, storage_key, presigned URL, AI text, or email | security review                |
| real child data appears in repo, tests, docs, screenshots, or PR body           | immediate cleanup before merge |

## Issue And PR Gates

Any PR touching the following areas must call out the gate in the PR body.

| area          | examples                                         | required gate               |
| ------------- | ------------------------------------------------ | --------------------------- |
| auth          | session, callback, cookies, `requireUser`        | security review             |
| authorization | ownership checks, 403/404 behavior               | security review + tests     |
| image         | upload, signed URL, cache, variants, storage key | privacy/security review     |
| AI            | prompt, image payload, generation log, quota     | privacy + AI quality review |
| deletion      | memory/profile/account/storage cleanup           | security + release review   |
| DB migration  | PII tables, FK, cascade, indexes                 | migration review            |
| release       | accepted risk, public launch, waiver             | human release decision      |

## Per-PR Checklist

- [ ] Does this change touch PII, image, AI, auth, logs, deletion, or DB migration?
- [ ] If yes, does the PR body name the matching gate and reviewer?
- [ ] Are OpenAPI security settings still aligned with route behavior?
- [ ] Are tests using only fake data?
- [ ] Are logs and error details allowlist-based?
- [ ] Are screenshots free of real child data and secret-like URLs?
- [ ] Are accepted risks either unchanged or explicitly updated here / in ADR?
