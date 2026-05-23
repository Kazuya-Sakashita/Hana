# 0006. 認証は Supabase Auth + SNS-only (email+password 廃止)

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya
- Supersedes: `Hana_PRD_v1.md` §11 の roll-our-own JWT + email+password 前提

## Context

PRD §11 は当初 `/v1/auth/register` `/v1/auth/login` を Hana 自前で持つ前提だった。
しかし以下の理由で再検討が必要:

- 個人開発で bcrypt / refresh token / password リセットメール基盤を維持するコストが大きい
- 子どもの写真・成長記録を扱うプロダクトで **password 漏洩リスクを構造的に持つ** ことが
  ユーザーへの説明責任の観点で重い
- Supabase Auth が Apple / Google を含む OAuth プロバイダを無料枠で提供する

候補:

- (A) Supabase Auth + email+password + SNS
- (B) Supabase Auth + **SNS-only** (Apple + Google)
- (C) Clerk (managed) + SNS
- (D) Roll-our-own (PRD §11 そのまま)

## Decision

**(B) Supabase Auth + SNS-only (Apple + Google)** を採用する。

- email+password は提供しない
- Apple Sign In + Google OAuth のみで認証
- アクセストークン / リフレッシュトークンは Supabase が管理 (cookie 経由)
- JWT は Supabase の発行する standard claims を使う
- フロントは `@supabase/ssr` で Server / Browser 双方の session を扱う

### ロードマップ

- ISSUE-006 (本Issue): **Google 先行**で実装。Apple Developer 未取得のため Apple は後追い
- ISSUE-006a (後追い): Apple Sign In を有効化

## Consequences

### 良い点

- **password 漏洩リスクが構造的にゼロ** (Hana の DB に password を持たない)
- 退会フロー・パスワードリセット・メール認証・bcrypt の運用が不要
- Apple/Google のセキュリティ機構 (2FA / 不審ログイン検知) をそのまま利用
- 子どもの写真を扱うアプリとして「**ユーザーが既に信頼しているプロバイダで認証**」と説明できる
- Supabase ダッシュボードで provider を on/off できる

### 悪い点 / 受容するコスト

- メールアドレスのみで登録する手段が無く、**Google/Apple アカウントを持たない潜在ユーザーを取りこぼす**
  - 統計上、ターゲット (0〜3 歳の子を持つ親、25〜35 歳) のほぼ全員が Google/Apple アカウントを保有しているため受容
- メールアドレスを直接入力する UI が無いので、**間違ったアカウントで登録した時のリカバリ** が SNS 側に依存
- 退会後の再登録時、同じ Google アカウントが auth.users の同 ID で復元される (cascade で profile も再作成)

これらは password 管理ゼロのメリットと引き換えに受容する。

## Implementation Notes

- `@supabase/supabase-js` + `@supabase/ssr` を採用
- Server Components / Route Handlers: `createServerClient` + Next.js `cookies()`
- Client Components: `createBrowserClient`
- API クライアント (`src/lib/api/client.ts`) の `resolveAuthToken` を Supabase session に接続
- profile の lazy 作成: `getCurrentUser()` 内で `prisma.profile.upsert`
- 詳細は `docs/api-driven-development/auth.md`

## References

- ISSUE-006 (本ADRを採用する Issue)
- ADR-0004 (Supabase 採用)
- ADR-0007 (RLS Phase 2)
- `Hana_PRD_v1.md` §11 API 設計 (本ADRで一部 supersede)
- `Hana_PRD_v1.md` §12 セキュリティ・プライバシー設計
- [Supabase Auth — Social login](https://supabase.com/docs/guides/auth/social-login)
