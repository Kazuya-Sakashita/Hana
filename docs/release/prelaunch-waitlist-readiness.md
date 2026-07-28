# Prelaunch Waitlist Readiness

このチェックリストは、公開前検証 traffic を `/lp` と `POST /v1/waitlist` へ流す直前に使う。
実際の secret 値、実メール、問い合わせ本文、raw request payload は記録しない。

## Machine Gate

`pnpm qa:issue091:waitlist-readiness -- --mode=contract` は、次の契約を read-only で確認する。

- production では `WAITLIST_EMAIL_HASH_PEPPER` が必須で、未設定なら待機リスト登録を失敗させる
- production では32文字以上の `PRODUCT_EVENT_HASH_PEPPER` が必須で、Secret Managerで管理する
- local / test では development pepper fallback が使えるが、production では使えない
- `waitlist_signups` migration が存在し、`email_hash` unique index と `created_at` index がある
- `WaitlistSignup.emailHash` は HMAC-SHA256 用の 64 文字 hash として扱われる
- `POST /v1/waitlist` は rate limit を通り、429 では `Retry-After` を返す
- 成功ログは operation / status / source / privacyPolicyVersion / level / ts に限定し、email / emailHash / id を出さない
- 公開 copy はメール配信基盤のサービス名を明記せず、案内停止・登録情報削除の連絡先だけを示す

## Human Gate

公開前 traffic を入れる前に、人間が次を確認する。

- staging と production に `WAITLIST_EMAIL_HASH_PEPPER` が設定されている
- staging と production に32文字以上の `PRODUCT_EVENT_HASH_PEPPER` が設定されている
- Supabase Cron (`pg_cron`) を有効化し、`hana-product-event-retention` が毎日実行される
- `pnpm db:migrate:deploy` 相当の手順で `waitlist_signups` migration が対象環境に適用済みである
- reverse proxy / hosting platform が `x-forwarded-for` または `x-real-ip` を渡す
- bot / abuse 対策は MVP の短時間 rate limit で開始し、異常 traffic が出たら追加対策を Issue 化する
- 問い合わせ先 `privacy@hana.app` の受信と運用担当者へのアクセス制御が確認済みである
- ISSUE-109 mailbox attestation で案内停止と登録情報削除を含む全4項目が `GO` である
- `pnpm pr:gate` と app-mode public QA が最新 main で通っている

## Go/Hold Attestation

ISSUE-109の直前のGO出力にある `attested_at` をPIIを含まない一時変数へ設定し、対象環境にenvが設定されたterminalで次のように入力する。

```bash
PRIVACY_ATTESTED_AT='<ISSUE-109 GO 出力の attested_at>'
pnpm qa:issue103:prelaunch-traffic -- \
  --mode=preflight \
  --target=staging \
  --migration=confirmed \
  --product-event-retention=confirmed \
  --proxy-client-ip=confirmed \
  --rate-limit=confirmed \
  --privacy-mailbox-receiving=confirmed \
  --privacy-mailbox-access-control=confirmed \
  --privacy-guidance-stop=confirmed \
  --privacy-registration-deletion=confirmed \
  --privacy-attestation-scope=prelaunch \
  --privacy-attestation-version=prelaunch-mailbox-v1 \
  --privacy-attested-at="$PRIVACY_ATTESTED_AT" \
  --public-qa=confirmed \
  --pr-gate=confirmed \
  --privacy-copy=confirmed
```

- required env の値を出力しない。`WAITLIST_EMAIL_HASH_PEPPER` / `PRODUCT_EVENT_HASH_PEPPER` / `DATABASE_URL` / `DIRECT_URL` は set / missing だけを判定し、`WAITLIST_TRUST_PROXY_HEADERS` は厳密に `true` かだけを判定する
- migration、proxy、rate limit、mailbox、public QA、PR gate、privacy copy は運用担当者の確認結果であり、外部状態を自動確認したことにはならない
- privacy mailbox の4引数は、直前に同じ運用版で ISSUE-109が `GO` になった場合だけ `confirmed` にする
- ISSUE-109の `scope=prelaunch`、`attestation_version=prelaunch-mailbox-v1`、`attested_at` が揃い、実行から30分以内の場合だけprivacy attestationを有効とする
- required env または attestation が 1 つでも未確認なら `HOLD` と終了コード 1 を返す
- 全項目が確認済みの場合だけ `GO` と終了コード 0 を返す
- ISSUE-103単独の `GO` は公開可を意味せず、ISSUE-105の全解除条件とhuman reviewを別途満たす必要がある
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

## Staging Public QA Strict Runtime

対象 staging の `STAGING_BASE_URL` を設定した terminal で、既存の LP / privacy public QA を read-only で実行する。

```bash
STAGING_BASE_URL=<public-https-origin> \
STAGING_EGRESS_CONTROL_CONFIRMED=confirmed \
CODEX_RUNTIME_NODE_MODULES=<node-modules-with-playwright> \
pnpm qa:issue110:staging-public -- --mode=runtime
```

- URL は command line ではなく `STAGING_BASE_URL` からだけ読み、ISSUE-106 と同じ公開 HTTPS origin 境界で判定する
- URL 未設定、localhost、loopback、IP literal、内部向け hostname、非 HTTPS、default 以外の port、credential、path / query / hash 付き URL は browser 起動前に HOLD にする
- runtime では A / AAAA を直前に解決し、private、loopback、link-local、reserved address が 1 件でも含まれれば browser を起動しない
- hosting / network 側で private、loopback、link-local、metadata address への egress が遮断されていることを operator が確認した場合だけ `STAGING_EGRESS_CONTROL_CONFIRMED=confirmed` を設定する。未設定・別値は HOLD にする
- browser QA は ISSUE-075 の app mode だけを固定引数で実行し、`/lp` と `/privacy` を既定 viewport matrix で確認する
- browser context は service worker を無効化し、WebSocketをserver接続前にcloseし、同一 origin の GET / HEAD / OPTIONS 以外を fail-closed にする
- waitlist POST だけを navigation 前に browser route で mockし、mock 発火回数を検証して実 DB へ書き込まない
- Web Vitals POST も204でmockし、stagingのログ基盤へQA telemetryを送らない
- 遮断対象のHTTP requestまたはWebSocketが1件でも発生した場合は、画面表示が正常でもQAをHOLDにする
- 子 process へ渡す env は allowlist に限定し、raw stdout / stderr を破棄する
- `CODEX_RUNTIME_NODE_MODULES` は Playwright を提供する operator 管理下の code path として扱い、QA 専用 terminal でだけ設定する
- evidence は固定 check ID と status だけとし、host、email、payload、browser raw output を残さない
- contract mode は外部 process や network request を実行せず、`pnpm pr:gate` に含める
- runtime PASS はegress制御のoperator確認、実行直前のDNS判定、staging public QAの成功だけを示す。DNS rebindingをapp内だけでは完全に防げないためegress制御を維持し、ISSUE-105全体のGOやproduction公開可とは扱わない

## Staging Migration Status

対象 staging の `DIRECT_URL` が設定された terminal で、migration を適用せず status だけを確認する。

```bash
pnpm qa:issue107:migration-status -- --mode=status --target=staging
```

- contract mode は Prisma CLI や外部 DB へ接続しない
- `--target=staging` の明示を operator attestation として必須にし、欠けている場合は Prisma CLI を起動しない
- status mode が実行するのは `prisma migrate status` だけで、deploy / dev / reset / db push は行わない
- Prisma の raw stdout / stderr は出力しない。connection string、host、database 名も evidence に残さない
- Prisma 子 process へは allowlist 済み env だけを渡し、QA 実行中は `.env.local` / `.env` を自動読込しない
- `DIRECT_URL` missing、timeout、signal、CLI error、未適用 migration はすべて `HOLD` と終了コード 1 に正規化する
- `PASS` はローカル migration 履歴（`waitlist_signups` を含む）と対象 DB の status が一致したことだけを示し、ISSUE-105 全体の GO を意味しない

## Proxy Client IP / Rate Limit Boundary

- hosting proxy が外部から届く `x-forwarded-for` / `x-real-ip` を除去または上書きすることを公開前に確認する
- 上記を確認できた環境でだけ `WAITLIST_TRUST_PROXY_HEADERS=true` を設定する。未設定または `false` では forwarding header を無視する
- trusted proxy 環境では `x-forwarded-for` の先頭にある local 用途でない valid IP、同条件の `x-real-ip`、共有 `unknown` bucket の順で client key を選ぶ
- private / loopback / link-local / invalid header 値は bucket key に使わず、header なしと同じ `unknown` bucket へ集約する
- IPv6 と IPv4-mapped IPv6 は canonical key に正規化し、同じ client が表記差で bucket を分割できないようにする
- active bucket は最大 1024 bucket とし、超過 client は共有 overflow bucket で安全側に制限する。期限切れ bucket は次の request で削除する
- 429 の `Retry-After` は該当 bucket の window reset までの残り秒数を返す
- client IP は process memory の bucket key にだけ使い、ログ、response、evidence、DB へ出力・保存しない
- app 内 limiter は 1 process 内の best effort であり、複数 instance 全体の abuse 対策は hosting edge 側で補完する
- header 設定が確認できない間は proxy / rate-limit attestation を `confirmed` にせず、ISSUE-105 を HOLD のままにする

## Privacy Mailbox Attestation

mailbox provider や問い合わせ内容を command line に含めず、運用担当者が確認した結果だけを入力する。

```bash
pnpm qa:issue109:privacy-mailbox -- \
  --mode=attest \
  --receiving=confirmed \
  --access-control=confirmed \
  --guidance-stop=confirmed \
  --registration-deletion=confirmed
```

- `receiving`: 個人情報を含まない管理用test fixtureで受信でき、監視手順が実行可能である
- `access-control`: 承認済みの個別accountだけがアクセスでき、認証強化と権限剥奪手順が確認できる。担当者名はevidenceに残さない
- `guidance-stop`: 管理環境内で依頼対象を特定し、今後のbeta版案内・正式リリース通知から除外できる。evidenceはstatus / countだけにする
- `registration-deletion`: `waitlist_signups` の `email` / `email_hash` を含む対象recordと下流連絡先copyを削除し、残存0件をstatus / countだけで確認できる
- 未確認項目が 1 つでもあれば `HOLD` と終了コード 1、全項目確認時だけ `GO` と終了コード 0 を返す
- 担当者名、実メール、問い合わせ本文、削除対象情報を argument や evidence に含めない
- command は固定metadata、check ID、statusだけを出力し、mailbox接続、test mail送信、配信停止、DB削除を実行しない
- 出力の `scope` は `prelaunch`、`attestation_version` は `prelaunch-mailbox-v1` とし、`attested_at` に実行時刻を記録する
- access権、mailbox / 配信基盤、waitlist schema、案内停止・削除手順のいずれかが変わった場合は古いGOを再利用せず再確認する
- `GO` は人間の運用確認結果であり、外部状態を自動確認したという claim にはしない
- live mailbox で確認できるまでは ISSUE-105 と公開前 traffic を HOLD のままにする

## Do Not Record

- 実ユーザーのメールアドレス
- `WAITLIST_EMAIL_HASH_PEPPER` の値
- `PRODUCT_EVENT_HASH_PEPPER` の値
- request / response body の raw dump
- screenshot / trace / HAR / accessibility snapshot
- 実写真、子ども / 親の実名、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文

## Escalation

次のいずれかが未確認なら、公開前 traffic は Hold にする。

- production pepper 未設定
- `WAITLIST_TRUST_PROXY_HEADERS=true` でない
- migration 未適用
- public QA 失敗
- ISSUE-109 mailbox attestation が `GO` でない
- privacy / legal review 済み copy から公開文言を変更した
