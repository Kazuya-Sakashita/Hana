---
id: ISSUE-122
title: OAuth callback の外部リダイレクトを遮断する
priority: P0
status: done
size: S
created_at: 2026-07-29
github_issue: 268
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - security
  - test_architecture
---

# ISSUE-122: OAuth callback の外部リダイレクトを遮断する

## 目的 (Why)

OAuth callback後の戻り先をHana内部の安全な相対パスへ限定し、外部サイトへの意図しないredirectを防ぐ。

## スコープ (What)

- 内部絶対パスだけを許可する純粋なredirect validatorを追加する
- OAuth callbackの`next`へvalidatorを適用する
- redirect先のoriginを`NEXT_PUBLIC_APP_URL`由来へ固定する
- 未認証画面からサインイン、OAuth callback、元画面まで`next`を安全に引き継ぐ
- OAuthへ渡すqueryはalbumの`month`とmemory detailの`saved=1`だけを許可する
- callback失敗時は固定reasonと安全な`next`を保持し、再試行案内を表示する
- 認証切れ時の記録下書きはowner照合付き保存を維持する
- 正常な内部パスと攻撃形式をテストする
- code欠落、session交換失敗、成功時の既存挙動を固定する

## やらないこと (Out of Scope)

- OAuth providerの追加
- Supabase設定の変更
- 外部URLへの任意redirect

## 影響範囲

- `src/app/auth/callback/route.ts`
- `src/app/sign-in/page.tsx`
- 未認証時に`/sign-in`へ遷移する画面
- `src/lib/auth/safe-redirect.ts`
- OAuth callbackとredirect validatorの単体テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] `/album`などの内部パスを許可する
- [x] `https://`、`//host`、バックスラッシュ、制御文字を拒否する
- [x] 不正値や未指定時は`/`へ戻す
- [x] URL正規化後に`//host`となるエンコード攻撃を拒否する
- [x] callbackのredirect先originはrequestのHostではなく設定値から決める
- [x] 平文HTTP originはlocalhost loopback以外で拒否する
- [x] 未認証時の元画面をOAuth開始からcallbackまで安全に引き継ぐ
- [x] 任意queryやfragmentをOAuth基盤へ転送しない
- [x] code欠落・session交換失敗時は`/sign-in`へ戻す
- [x] callback失敗時は固定reasonによる再試行案内を表示する
- [x] 正常系と攻撃形式のRoute Handlerテストがある

## セキュリティ・プライバシー考慮

- redirect値、認証code、session情報をログへ出力しない
- validatorはorigin比較だけでなく、scheme-relativeとバックスラッシュも明示的に拒否する
- テストには実provider、実code、実ユーザー情報を使わない

## 検証

- [x] validatorとcallbackのfocused tests
- [x] Security / Test Architectureレビュー
- [x] `git diff --check`
- [x] `pnpm pr:gate`

## 専門レビュー記録

### Round 1

- Security: URL正規化後に`//host`となるencoded dot-segment攻撃を指摘
- Web Architecture / Product: OAuth開始時の`next`引き継ぎ不足を指摘
- Test Architecture: callback redirect originの`request.url`依存を指摘
- 判定: REQUEST_CHANGES、全件修正してfocused testを追加

### Round 2

- Security: 非loopback HTTPと任意query転送を指摘
- Web Architecture / Product: client/server origin不一致、下書き消失、離脱導線、失敗案内を指摘
- Test Architecture: client側origin fallbackと実配線テスト不足を指摘
- 対応: origin決定を共通化し、route別query allowlist、owner照合付き下書き維持、公開LP導線、固定reason、DOM実配線テストを追加
- 既存のサインアウト失敗検知は別責務としてGitHub #278へ分離
- 判定: REQUEST_CHANGES、Round 3で再確認する

### Round 3

- Security: open redirect、Host poisoning、HTTP制約、query allowlist、draft owner境界を再確認
- Web Architecture / Product: OAuth往復、失敗retry、離脱導線、下書き復元を再確認
- Test Architecture: DOM実配線、Route Handler、攻撃回帰、全callsite contractを再確認
- 判定: 3名とも APPROVE、ブロッキング指摘なし
- 最終検証: `pnpm pr:gate` 成功、114 test files / 903 tests
