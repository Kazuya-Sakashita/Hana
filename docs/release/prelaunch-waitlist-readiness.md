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
