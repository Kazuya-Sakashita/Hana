# 0002. フロントエンドスタックは Next.js (App Router) + Route Handlers 同居

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

Hana はモバイルファーストの育児記録アプリだが、MVP では:

- ストア審査・端末買い回しのコストを後ろに倒したい
- バックエンドと同じ TypeScript で書きたい
- 個人開発で運用負荷を最小化したい
- 将来ネイティブが必要になれば React Native へ移行する余地を残したい

候補:

- (A) Next.js (App Router) + Route Handlers 同居 / PWA で配布
- (B) Expo (React Native) + 別バックエンド（Hono on Cloudflare Workers 等）
- (C) Remix / SvelteKit など

## Decision

**(A) Next.js (App Router) + Route Handlers 同居 / pnpm / 単一リポ** を採用する。

- フロント: Next.js App Router、React 19
- バックエンド: 同リポの Route Handlers（`app/api/...` または `app/(api)/...`）
- パッケージマネージャ: pnpm
- 言語: TypeScript 6（strict）
- リポ構成: 単一リポ（必要になれば後でモノレポ化）
- 配布: 初期は Web + PWA。ネイティブが必要になったタイミングで Expo を別途検討（ADR で再判断）

## Consequences

### 良い点

- 1 プロセス・1 言語で完結し、個人開発の運用負荷が最小
- Vercel との相性が良く、デプロイが Git push で完結
- Route Handlers で OpenAPI と整合した API を素直に書ける
- Claude Code が単一リポを読みやすい

### 悪い点 / 受容するコスト

- ネイティブ機能（バックグラウンド・通知の表現力）には限界がある
  → MVP では PWA + Web Push でカバー、v1 以降で再評価
- Server Components / Client Components の境界設計を毎回意識する必要がある
- Vercel 依存が緩やかに進む可能性（OpenAPI / Route Handlers は標準仕様寄りなので退路は確保）

## Implementation Notes

- `app/` ディレクトリは `src/app/` に配置（path alias `@/*` → `./src/*`）
- API は `/v1/...` プレフィクスで Route Handlers に実装（ISSUE-005 以降で詳細）
- 認証は JWT Bearer。Route Handlers 用ミドルウェアで検証（ISSUE-005）
- 画像は Presigned URL（30 分）。ストレージ実体は別 ADR で決定

## References

- ADR-0001（OpenAPI を Single Source of Truth にする）
- `CLAUDE.md` §3, §5, §7
- `Hana_PRD_v1.md` §11 API 設計, §12 セキュリティ
