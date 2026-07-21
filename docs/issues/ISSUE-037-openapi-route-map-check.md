---
id: ISSUE-037
title: OpenAPI と Next.js Route Handler の route-map check を追加する
priority: P1
status: review
size: M
created_at: 2026-07-21
release_gate: mvp_quality
ready_for_codex: true
automation_level: pr_ready
blocked_by: []
requires_human_review:
  - api
---

## 目的 (Why)

OpenAPI は Hana API の正本だが、現在は `docs/openapi/openapi.yaml` と `src/app/v1/**/route.ts` の path / method / security が機械的に照合されていない。

Codex が API 実装を自動で進めると route drift が起きやすいため、OpenAPI paths と Next.js Route Handler exports を照合する check を追加する。

## スコープ (What)

- `pnpm openapi:route-map` script を追加する
- OpenAPI paths から expected route/method を抽出する
- `src/app/v1/**/route.ts` から actual route/method を抽出する
- missing route / extra route / missing method を検出する
- `/health` の扱いを仕様か実装のどちらに寄せるか決める
- 将来的に auth/security metadata check に拡張できる形にする

## やらないこと (Out of Scope)

- Schemathesis contract test
- full runtime API smoke
- OpenAPI schema validation の置換

## 影響範囲

- `scripts/`
- `package.json`
- `docs/openapi/openapi.yaml`
- `src/app/v1/**/route.ts`
- CI（必要なら）

## 受け入れ条件 (Acceptance Criteria)

- [x] `pnpm openapi:route-map` が実行できる
- [x] OpenAPI にある path/method と Route Handler export の差分を検出できる
- [x] CI または `pnpm pr:gate` に組み込む方針が決まっている
- [x] `/health` の drift が解消または明示的に許容されている

## セキュリティ・プライバシー考慮

- この check はソース構造のみを読む
- request body / env / secrets / user data は扱わない

## 参考

- `docs/openapi/openapi.yaml`
- `src/app/v1/`
- `docs/api-driven-development/openapi-style-guide.md`
- `scripts/check-openapi-route-map.mjs`
