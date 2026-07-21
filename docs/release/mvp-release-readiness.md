---
title: Hana MVP Release Readiness
last_updated: 2026-07-21
owner: kazuya
status: draft
---

# Hana MVP Release Readiness

この文書は Hana MVP を出してよいか判断するための単一入口です。
Issue / PR / ADR / perf docs に分散した証跡をここへ集約し、最後に人間が Go / Hold / No-Go を判断できる状態を作ります。

## Recording Rules

- 子ども・親の氏名、生年月日、メールアドレス、画像 URL、storage_key、AI 生成本文は書かない。
- スクリーンショットを残す場合は架空データだけを使い、顔写真・実名・実メールを含めない。
- AI 品質レビューは本文の貼り付けではなく、評価結果・違和感の分類・再現手順だけを残す。
- `pnpm pr:gate` や手動 smoke の出力は、失敗箇所と再実行結果だけを要約する。

## Decision Summary

| item                  | value                 |
| --------------------- | --------------------- |
| target release        | MVP                   |
| decision              | Go / Hold / No-Go     |
| decision date         | YYYY-MM-DD            |
| release owner         | name                  |
| privacy reviewer      | name / pending        |
| security reviewer     | name / pending        |
| AI quality reviewer   | name / pending        |
| latest candidate PR   | #                     |
| latest `pnpm pr:gate` | pass / fail / not run |

## MVP Core Loop Scope

ISSUE-032 の主対象は、PRD §6 の Must Have のうち「写真 → AI 文章生成 → 編集 → 保存 → 見返す」の core loop に直結する機能です。
core loop 以外の PRD Must Have は、次の reconciliation 表で release blocker / accepted risk / deferred work として明示的に扱います。

| area             | MVP expectation                                                          | evidence                 | status |
| ---------------- | ------------------------------------------------------------------------ | ------------------------ | ------ |
| auth             | Google / Apple OAuth のどちらかでログインできる。未認証 API は拒否される | PR / test / manual smoke | todo   |
| child profile    | 1 ユーザー 1 子どもを登録・取得・更新できる                              | PR / test / manual smoke | todo   |
| photo upload     | 1〜5 枚の写真を private storage にアップロードし、公開 URL を使わない    | PR / test / manual smoke | todo   |
| AI generation    | opt-in 後、写真からタイトル・本文・タグを生成できる                      | PR / test / AI review    | todo   |
| edit/save memory | 生成文を保存前に編集し、記録として保存できる                             | PR / test / manual smoke | todo   |
| album            | 保存した記録を一覧で確認できる                                           | PR / test / manual smoke | todo   |
| memory detail    | 記録詳細で写真と本文を確認できる                                         | PR / test / manual smoke | todo   |

## PRD Must Have Reconciliation

PRD §6 の Must Have で core loop 表に入っていないものは、ここで release 判定を明示する。

| PRD Must Have             | readiness treatment                                                                           | release decision needed |
| ------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| タイムライン表示（新→旧） | album / home 表示として確認。正式な timeline 仕様との差は accepted risk または blocker に記録 | yes                     |
| 月別ふりかえり            | ISSUE-032 では実装しない。MVP に含めるなら blocker、外すなら waiver / deferred work を記録    | yes                     |
| 「今日で○日目」バッジ表示 | ISSUE-032 では実装しない。MVP に含めるなら blocker、外すなら waiver / deferred work を記録    | yes                     |

MVP 外として扱うもの: 家族共有、SNS 共有、外部共有リンク、動画、フォトブック、複数子ども、コメント・いいね、検索・タグ管理、課金。

## Golden Path: 30 Second Flow

計測は dev / staging の架空データで行う。実写真・実名は使わない。

| step          | expected                                     | result | notes |
| ------------- | -------------------------------------------- | ------ | ----- |
| sign in       | 認証済み状態でホームへ入れる                 | todo   |       |
| child profile | 子どもプロフィールが 1 件登録済み            | todo   |       |
| select photo  | 写真選択が 10 秒以内に完了する               | todo   |       |
| AI generation | 生成待ちが 5〜15 秒程度に収まる              | todo   |       |
| edit          | タイトル・本文を確認し、軽く編集できる       | todo   |       |
| save          | 保存完了し、ホームまたは album に戻れる      | todo   |       |
| album/detail  | 一覧から詳細へ移動し、画像と本文が表示される | todo   |       |

Measurement log:

| date       | device           | browser         | network         | photo count | elapsed | result    | evidence    |
| ---------- | ---------------- | --------------- | --------------- | ----------- | ------- | --------- | ----------- |
| YYYY-MM-DD | iPhone / desktop | Safari / Chrome | Wi-Fi / Slow 4G | 1           | 00s     | pass/fail | PR # / note |

## Automated Gate

| command                  | required when              | latest result | notes                                    |
| ------------------------ | -------------------------- | ------------- | ---------------------------------------- |
| `pnpm pr:gate`           | every release candidate PR | todo          | format / lint / typecheck / test / build |
| `pnpm openapi:lint`      | OpenAPI changed            | todo          | OpenAPI is API source of truth           |
| `pnpm openapi:gen`       | OpenAPI changed            | todo          | generated types must be committed        |
| `pnpm openapi:route-map` | after ISSUE-037            | todo          | OpenAPI paths vs Route Handler exports   |

## Privacy And Security Smoke

| check                | expectation                                                                                                       | result | blocker if failed |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| auth required        | private API calls require a valid session                                                                         | todo   | yes               |
| ownership            | other-user children / memories / images return 403 or documented 404                                              | todo   | yes               |
| public endpoints     | only explicitly public endpoints bypass auth                                                                      | todo   | yes               |
| image privacy        | app never uses public image URLs                                                                                  | todo   | yes               |
| EXIF / GPS stripping | EXIF is stripped before storage and AI send, or ADR-0009 accepted risk is explicitly approved by a human reviewer | todo   | yes               |
| signed URL TTL       | image download URLs are short-lived and private-cache only                                                        | todo   | yes               |
| storage key exposure | `storage_key` is not returned to normal UI responses or logs                                                      | todo   | yes               |
| logs                 | request logs exclude body, email, names, image URL, storage_key, AI text                                          | todo   | yes               |
| AI opt-in            | AI generation is blocked until consent exists                                                                     | todo   | yes               |
| AI payload           | birthdate, email, surname, address, raw location are not sent                                                     | todo   | yes               |
| deletion             | logical deletion behavior and physical deletion gap are documented                                                | todo   | release decision  |

Security / privacy details should be checked against `AGENTS.md`, `docs/api-driven-development/security-and-privacy.md`, ADR-0007, ADR-0009, ADR-0011, and ADR-0012.
The table above is the operational smoke checklist for release readiness; the security/privacy guide remains the source of truth for policy details.

## Rollback Readiness

各 release candidate ごとに、どこまで戻せるかを記録する。
DB migration や storage 変更がある場合は、rollback 手順なしで release gate を通さない。

| field                 | value                                              |
| --------------------- | -------------------------------------------------- |
| candidate PR          | #                                                  |
| candidate commit      | SHA                                                |
| environment           | local / staging / production                       |
| deployed version      | version / deployment URL                           |
| DB migration impact   | none / additive / destructive                      |
| storage impact        | none / schema / object mutation                    |
| rollback owner        | name                                               |
| rollback command / PR | revert PR / deploy previous version / manual steps |
| rollback verification | `pnpm pr:gate` / smoke / data check                |
| rollback decision     | ready / needs work / not applicable                |

## AI Quality Review

本文そのものは保存しない。架空データで生成し、評価だけを残す。

| criterion      | pass condition                             | result | notes |
| -------------- | ------------------------------------------ | ------ | ----- |
| natural tone   | 親の記録として違和感が少ない               | todo   |       |
| no overclaim   | 写真にない事実・感情・発達評価を断定しない | todo   |       |
| editable       | 保存前に自然に編集できる                   | todo   |       |
| no PII leak    | 禁止データを出力しない                     | todo   |       |
| length         | タイトル・本文が PRD の目安に収まる        | todo   |       |
| retry/fallback | エラー時に破綻しない                       | todo   |       |

## Mobile And Slow Network Smoke

`docs/perf/README.md` の標準手順を使い、最低限以下を確認する。

| check                 | target                                                        | result | notes |
| --------------------- | ------------------------------------------------------------- | ------ | ----- |
| Lighthouse mobile     | core pages are usable, regressions recorded                   | todo   |       |
| Slow 4G Network panel | request count / transfer size / load time recorded            | todo   |       |
| 4x CPU slowdown       | optional for heavy UI changes                                 | todo   |       |
| image loading         | album/detail do not fetch unnecessarily large original images | todo   |       |
| AI wait state         | generation pending UI remains understandable                  | todo   |       |

## Release Blockers

Blocker は release 前に解消するか、人間が明示的に waiver する。

| blocker                                                    | owner       | status | unblock condition                                |
| ---------------------------------------------------------- | ----------- | ------ | ------------------------------------------------ |
| privacy policy / terms not reviewed for AI image sending   | human       | todo   | legal/privacy review complete                    |
| AI vendor retention terms not confirmed                    | human       | todo   | vendor retention policy recorded                 |
| route ownership tests missing for private APIs             | engineering | todo   | tests or waiver recorded                         |
| account deletion / storage physical purge not implemented  | engineering | todo   | implemented or accepted risk signed              |
| PRD Must Have item is omitted without waiver               | human       | todo   | blocker / accepted risk / deferred work recorded |
| EXIF / GPS stripping has no test evidence or accepted risk | engineering | todo   | test evidence or ADR-0009 risk approval          |
| real-data screenshots/logs in repo or PR                   | engineering | todo   | remove and rotate affected secrets if needed     |

## Accepted Risks

Accepted risk は「残してよい」ではなく、MVP で抱える理由・監視方法・後続 Issue を持つ。

| risk                               | reason accepted for MVP                        | mitigation                                | follow-up            |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------------- | -------------------- |
| RLS is Phase 2                     | Route Handler ownership checks keep MVP simple | route tests and code review               | ADR-0007 follow-up   |
| client-side EXIF removal           | server-side hook adds cost and complexity      | Canvas re-encode path + human review      | future Storage hook  |
| short browser cache for signed URL | performance needs practical caching            | `private, max-age=300`, clear on sign-out | ADR-0012 follow-up   |
| orphan upload files                | confirm may not be called                      | cleanup job planned                       | future cleanup Issue |

## Deferred Work

| item                            | reason                                    |
| ------------------------------- | ----------------------------------------- |
| family sharing                  | MVP scope excludes it                     |
| SNS / external share            | privacy risk and product concept mismatch |
| multiple children               | ADR-0008 keeps MVP to one child           |
| billing                         | v1+                                       |
| full production security review | pre-public launch gate, not per-PR work   |

## Human Gates

| gate            | required reviewer       | pass condition                                          | decision |
| --------------- | ----------------------- | ------------------------------------------------------- | -------- |
| merge gate      | engineer                | PR review complete, CI green, rollback record present   | pending  |
| privacy gate    | human privacy reviewer  | no unreviewed child data / AI vendor / deletion blocker | pending  |
| security gate   | human security reviewer | auth, ownership, logs, image access smoke accepted      | pending  |
| AI quality gate | human product reviewer  | generated output is acceptable without storing samples  | pending  |
| release gate    | kazuya                  | blockers closed or waived, accepted risks explicit      | pending  |

Final decision:

| date       | decision          | approver | notes |
| ---------- | ----------------- | -------- | ----- |
| YYYY-MM-DD | Go / Hold / No-Go | name     |       |
