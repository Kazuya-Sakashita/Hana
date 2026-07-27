# Prelaunch Waitlist Readiness

このチェックリストは、公開前検証 traffic を `/lp` と `POST /v1/waitlist` へ流す直前に使う。
実際の secret 値、実メール、問い合わせ本文、raw request payload は記録しない。

## Machine Gate

`pnpm qa:issue091:waitlist-readiness -- --mode=contract` は、次の契約を read-only で確認する。

- production では `WAITLIST_EMAIL_HASH_PEPPER` が必須で、未設定なら待機リスト登録を失敗させる
- local / test では development pepper fallback が使えるが、production では使えない
- `waitlist_signups` migration が存在し、`email_hash` unique index と `created_at` index がある
- `WaitlistSignup.emailHash` は HMAC-SHA256 用の 64 文字 hash として扱われる
- `POST /v1/waitlist` は rate limit を通り、429 では `Retry-After` を返す
- 成功ログは operation / status / source / privacyPolicyVersion / level / ts に限定し、email / emailHash / id を出さない
- 公開 copy はメール配信基盤のサービス名を明記せず、案内停止・登録情報削除の連絡先だけを示す

## Human Gate

公開前 traffic を入れる前に、人間が次を確認する。

- staging と production に `WAITLIST_EMAIL_HASH_PEPPER` が設定されている
- `pnpm db:migrate:deploy` 相当の手順で `waitlist_signups` migration が対象環境に適用済みである
- reverse proxy / hosting platform が `x-forwarded-for` または `x-real-ip` を渡す
- bot / abuse 対策は MVP の短時間 rate limit で開始し、異常 traffic が出たら追加対策を Issue 化する
- 問い合わせ先 `privacy@hana.app` の受信と運用担当者へのアクセス制御が確認済みである
- `pnpm pr:gate` と app-mode public QA が最新 main で通っている

## Go/Hold Attestation

確認結果は secret 値を command line に含めず、対象環境に env が設定された terminal で次のように入力する。

```bash
pnpm qa:issue103:prelaunch-traffic -- \
  --mode=preflight \
  --target=staging \
  --migration=confirmed \
  --proxy-client-ip=confirmed \
  --rate-limit=confirmed \
  --privacy-mailbox=confirmed \
  --public-qa=confirmed \
  --pr-gate=confirmed \
  --privacy-copy=confirmed
```

- `WAITLIST_EMAIL_HASH_PEPPER` / `DATABASE_URL` / `DIRECT_URL` は値を出力しない。set / missing だけを判定する
- migration、proxy、rate limit、mailbox、public QA、PR gate、privacy copy は運用担当者の確認結果であり、外部状態を自動確認したことにはならない
- required env または attestation が 1 つでも未確認なら `HOLD` と終了コード 1 を返す
- 全項目が確認済みの場合だけ `GO` と終了コード 0 を返す
- production では `--target=production` を使い、staging の結果を流用しない

## Staging Target Contract

staging の hosting target は、値を command line や evidence に含めず、対象 terminal の env から確認する。

```bash
pnpm qa:issue106:staging-target -- --mode=preflight
```

- `STAGING_HOSTING_PLATFORM` と `STAGING_BASE_URL` は set / missing と URL shape だけを判定する
- localhost、loopback、IP literal、内部向け hostname、非 HTTPS、credential 付き URL、path / query / hash 付き URL は HOLD にする
- platform と host 名は出力しない
- DNS 解決や到達確認は行わないため、GO は公開 URL shape の確認であり、hostname の解決先や稼働状態を保証しない
- target contract の GO は staging target の入力境界だけを示し、migration、proxy、mailbox、public QA の完了を意味しない

## Do Not Record

- 実ユーザーのメールアドレス
- `WAITLIST_EMAIL_HASH_PEPPER` の値
- request / response body の raw dump
- screenshot / trace / HAR / accessibility snapshot
- 実写真、子ども / 親の実名、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文

## Escalation

次のいずれかが未確認なら、公開前 traffic は Hold にする。

- production pepper 未設定
- migration 未適用
- public QA 失敗
- 問い合わせ先の受信・アクセス制御未確認
- privacy / legal review 済み copy から公開文言を変更した
