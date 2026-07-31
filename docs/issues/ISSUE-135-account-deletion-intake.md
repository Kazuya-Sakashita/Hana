---
id: ISSUE-135
title: 退会受付で全セッションとデータアクセスを即時停止する
priority: P0
status: review
size: L
created_at: 2026-07-31
github_issue: 294
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - privacy
  - security
  - legal
---

# ISSUE-135: 退会受付で全セッションとデータアクセスを即時停止する

## 目的 (Why)

利用者が退会を要求した時点で、子どもの写真・記録への通常アクセスを即時停止し、退出権を保証する。

## スコープ (What)

- OpenAPI先行で退会要求APIを定義する
- 再認証と明示確認を要求する
- 退会受付と論理削除状態を原子的に保存する
- 全端末のセッションを失効する
- 退会済み利用者の通常APIアクセスを遮断する
- Google OAuthで同一Supabase userを再認証する短寿命・一回限りの削除intent
- 退会受付後のAuth失効を再試行できるoutbox

## やらないこと (Out of Scope)

- 30日後のDB・Storage・Auth物理削除
- データエクスポート

## 実装契約

- 通常APIの認証gateは`profiles.access_blocked_at IS NULL`を必須とする
- 退会受付・アクセス遮断・子ども/記録/画像の論理削除・AI同意解除・Auth失効outboxを同一DB transactionで確定する
- Supabase Auth失効はDB commit後に行い、失敗してもアクセス遮断を戻さない
- global sign-out後も既発行access JWTは期限まで有効なため、DB gateを即時遮断の正本とする
- 通常APIからProfileをlazy createせず、退会済みsubjectを復活させない
- 再認証intentはraw tokenを保存せずhashのみ、5分TTL、一回消費、現在user idとOAuth callback user idの一致を必須とする
- email一致、クライアントフラグ、token refreshだけを再認証証拠にしない
- 成功後は認証不要の退会完了画面へ`replace`し、query/image URL/draft cacheを消去する
- 202応答が失われても、raw secretをHttpOnly cookie、hashをDBに保持する受付結果照会で収束する
- Auth失効はlease・backoff・上限付きのworkerで再試行し、provider側の削除済みを成功として収束する
- Vercel Cronが5分ごとにworkerを起動し、`CRON_SECRET`がない環境では内部endpointを公開しない

## 受け入れ条件 (Acceptance Criteria)

- [x] 再認証と明示確認なしでは退会できない
- [x] 退会受付と論理削除状態が原子的に保存される
- [x] 受付後は全セッションが失効する
- [x] 本人を含む通常APIから子ども・記録・画像へアクセスできない
- [x] 重複要求を冪等に処理する
- [x] 記録本文、氏名、画像URL、storage keyをログへ出さない
- [x] 古いaccess JWTでも通常API・private pageへアクセスできない
- [x] Auth失効失敗後もアクセス遮断を維持し、安全に再試行できる
- [x] 退会済みsubjectのProfileを再作成しない
- [x] 別Googleアカウント、期限切れ、使用済みintentでは退会できない
- [x] 既発行signed URLの最大30分残余アクセスについてPrivacy / Legal判断を記録する
- [x] Privacy / Security / Legalレビューを通す

## 決定済みポリシー

既発行済みの画像signed URLはglobal sign-outでは失効せず、最大30分アクセスできる。

2026-07-31にプロダクトオーナーがAを選択した。

- 採用: 新規URL発行と通常APIを即時停止し、既発行URLはTTL満了（最大30分）までの残余アクセスとして扱う
- 不採用: 退会受付時のStorage object隔離（移動失敗・再試行・DB整合性の複雑性が増えるため）
- 承認: 2026-07-31にプロダクトオーナーがA方針と画面文言を承認し、Privacy / Legalのマージ前HOLDを解除した

## Blocked by

None - can start immediately.
