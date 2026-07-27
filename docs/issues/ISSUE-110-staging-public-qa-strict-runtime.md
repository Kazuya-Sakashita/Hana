---
id: ISSUE-110
title: staging public QA の strict runtime mode を追加する
priority: P0
status: review
size: M
created_at: 2026-07-28
github_issue: 240
parent: ISSUE-105
blocked_by: []
external_blockers:
  - staging hosting target と STAGING_BASE_URL の設定
  - staging egress 制御の operator 確認
requires_human_review:
  - staging public QA 実行結果
---

# ISSUE-110: staging public QA の strict runtime mode を追加する

## 目的 (Why)

明示された staging public URL だけを対象に、既存の `/lp` / `/privacy` public QA を host や入力内容を evidence に残さず実行できるようにする。

## スコープ (What)

- `STAGING_BASE_URL` を env からだけ受け取り、ISSUE-106 と同じ公開 HTTPS origin 境界で判定する
- URL が未設定、不正、localhost、IP literal、内部向け host、default 以外の port の場合は browser を起動せず HOLD にする
- A / AAAA の全解決結果を検査し、public address 以外を含む場合は browser を起動しない
- staging egress 制御の operator 確認がない場合は browser を起動しない
- ISSUE-075 の app mode だけを固定引数で実行し、子processの raw stdout / stderr を破棄する
- service workerを無効化し、WebSocketを接続前にcloseして、同一originのread-only requestだけを許可する
- waitlist POST を browser route で mockし、発火回数を検証して実DBへ書き込まない
- Web Vitals POST もmockし、stagingのログ基盤へQA telemetryを送らない
- network policy違反を遮断するだけでなく、1件でも検知した場合はQAをHOLDにする
- contract mode を `pnpm pr:gate` に接続する

## やらないこと (Out of Scope)

- staging の作成、deploy、hosting platform の選定
- staging URL、host、email、request payload の記録
- screenshot、trace、HAR、accessibility snapshot の保存
- API / OpenAPI / DB / LP / privacy copy の変更
- production public QA または公開前 traffic の GO 判定

## 影響範囲

- `scripts/qa/issue-110-staging-public-qa-strict-runtime.cjs`
- `scripts/qa/issue-075-lp-public-qa.cjs` の既存 mock 契約
- `tests/unit/app/staging-public-qa-strict-runtime.test.ts`
- `docs/release/prelaunch-waitlist-readiness.md`
- `docs/issues/README.md`
- `package.json`

## 受け入れ条件 (Acceptance Criteria)

- [x] staging URL 未設定、localhost、IP literal、不正 URL、private DNS解決結果、egress未確認を browser 起動前に拒否する
- [x] app mode は全mutationをfail-closedにし、waitlist POST mockの発火回数を検証して実DBへ書き込まない
- [x] HTTP / WebSocketのnetwork policy違反を検知した場合はQAをHOLDにする
- [x] output に host、email、payload、browser raw output を含めない
- [x] URL 判定が ISSUE-106 target contract と整合する
- [x] contract mode が `pnpm pr:gate` に接続される
- [x] focused unit tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- runtime の target URL は command line ではなく `STAGING_BASE_URL` からだけ読む
- 子processへ渡す env は allowlist に限定し、service role key や AI key を継承しない
- 子processの stdout / stderr は破棄し、status-only evidence に正規化する
- contract mode は browser や外部processを起動しない
- runtimeのDNS判定は実行直前の安全確認であり、DNS rebindingを完全には防げない。hosting / network側のegress制御を維持する
- `CODEX_RUNTIME_NODE_MODULES` はrepo codeを実行できるoperator管理下のcode pathとして扱い、QA専用terminal以外では設定しない
- runtime PASS は `/lp` / `/privacy` のQA成功だけを示し、ISSUE-105全体のGOを意味しない

## 検証

- [x] `pnpm qa:issue110:staging-public -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/staging-public-qa-strict-runtime.test.ts`
- [x] production build + ISSUE-075 app mode（LP / privacy 4 viewport + no-JS）
- [x] `git diff --check`
- [x] `pnpm pr:gate`

## 専門レビュー

- Round 1: URL / DNS境界、waitlist mock発火確認、同一origin guardの指摘を修正
- Round 2: IPv6 special-use、HTTP / WebSocket違反の最終HOLD、egress確認の指摘を修正
- Round 3: blocker 0。Playwright module pathはoperator管理下の既存信頼境界として明記

## staging 実行

staging URL を設定した operator terminal でだけ実行する。

```bash
STAGING_BASE_URL=<public-https-origin> \
STAGING_EGRESS_CONTROL_CONFIRMED=confirmed \
CODEX_RUNTIME_NODE_MODULES=<node-modules-with-playwright> \
pnpm qa:issue110:staging-public -- --mode=runtime
```

値は evidence や Issue / PR へ記録しない。runtime の実行には staging target が必要なため、現在の実装PRでは contract とmocked unit testだけを検証する。
