# 0018. Telemetry requestをPII-safe v2へ原子的に切り替える

- Status: accepted
- Date: 2026-08-07
- Deciders: Kazuya-Sakashita
- Related: ISSUE-152 / GitHub Issue #322

## Context

従来のWeb Vitals requestはraw metric ID、数値、path、navigation typeをserverへ送り、同一originの
`sendBeacon`がsession cookieも送信していた。ProductEvent outboxはeventを作ったactorへ拘束されず、
別actorのsessionで204を受けると誤帰属できた。またserver receipt timeだけでは、遅延再送されたstageの
30分windowを正しく判定できない。

このendpointはHanaの第一者browser clientだけが使用し、外部client互換を提供する公開integrationではない。
privacy事故を避けるには旧payloadを受理し続けず、client、OpenAPI、generated type、Route Handlerを同じ
release unitで切り替える必要がある。

## Decision

- Web Vitalsは`hana-web-vitals-report/v2`へ切り替え、browser内でraw値を固定dimensionへ変換する。
- Web Vitals senderは`fetch`の`credentials: omit`、`referrerPolicy: no-referrer`、`keepalive`だけを使い、
  `sendBeacon`を使わない。
- Web Vitals serverは同一origin JSON browser requestとv2のexact fixed shapeだけを受理し、rate limit後・
  validation後・log前にversioned server-only HMAC 10% samplingを適用する。`Origin`と
  `Sec-Fetch-Site: same-origin`を公開契約で必須にし、sampling key / key versionが欠けたproduction requestは
  503でfail closedにする。信頼済みedgeと共有rate limitが
  未有効ならproduction endpointを503にする。
- ProductEvent bodyへretry中も不変の`occurred_minute_utc`を追加する。
- ProductEvent event IDは発生minuteを先頭48 bitへ埋め込んだUUIDv7とし、DB `event_id`からminute、
  DB `created_at`からreceipt timeを復元する。
- funnel anchorの正本はDB `event_id`から復元する`[minute, minute + 1 minute)`とし、区間全体がevidence
  entry window内にない場合はHOLDにする。DB `created_at`はreceiptと遅延・順序の検証だけに使う。
- Web Vitals event IDはOpenAPI `format: uuid`と同じ範囲を受理し、共有threshold表から取り得ない
  statusとduration bucketの組み合わせは422で拒否する。
- `GET /me`が返す期限付きserver-minted opaque binding v3をProductEvent headerに必須化し、`getUser()`で
  検証したactor、`getClaims()`で検証したJWT `sub / session_id`、期限とconstant-timeで一致する場合だけ
  ingestへ進む。
- outbox v4はbindingをrootに1つだけ保持する。同じ`session_id`のtoken rotationだけをopaque continuity tagで
  継続し、別actorまたは別`session_id`なら送信前に全件破棄する。
- 401 / 403後は有限timeout付きで`GET /me`を1回だけ強制再取得する。同じcontinuityの新bindingだけを
  同じevent IDの再送へ使い、別continuity、確認済み未認証、再取得timeoutでは旧rootを破棄する。
  一時的な再取得不能では拒否bindingをtombstone化して送信を止め、新しい同一continuity bindingを待つ。
- 送信とbinding再取得は`AbortController`とbinding generationへ拘束する。認証境界で旧処理を中断し、
  遅延した旧generationの応答が新sessionのoutboxやcurrent-user cacheを変更することを禁止する。
- degradationはcontinuity単位で保持し、別sessionのoutboxは`NONE`から開始する。
- outboxはdurable enqueueできない場合に直接送信せず、固定degradationを保持してcompletenessをHOLDにする。
- ProductEvent authority / retention / expectation登録と、全key version退会purge / HMAC key lifecycleの
  どちらかが未有効ならproduction endpointを503にする。独立したversioned activationを両方要求し、
  片方だけの有効化や未知値をfail closedにする。
- binding、event ID、raw metric、path、actor hashは通常logやstatus-only evidenceへ出さない。
- expectation manifestへsampling key versionとsampling key commitmentをcommitし、source / key version /
  event IDをdomain-separated HMACへ入力する。received envelopeはcanonical RFC3339を含めruntimeで再検証し、観測窓外または内容が異なる
  duplicateをcompleteness HOLDにする。
- right-censor rate evaluatorは高いほど良いproduction rate 8指標だけに限定し、M12など異なる方向の
  指標は`unsupported_metric_direction`でHOLDにする。samplingはcanonical NUL区切り入力の固定HMAC
  test vectorでdigestとthreshold判定を検証する。

## Compatibility and approval

旧requestを送るclientは422または403になるため、これは意図したbreaking changeである。採用には次を
すべて必須とする。

1. OpenAPI-first差分、生成型、client、server、契約testを同じPR head SHAへ固定する。
2. `oasdiff` exact report hashへ限定したunexpired waiverを記録する。
3. 人間が`openapi-breaking-approved` labelを付与する。
4. api-contract / security-authorization / privacy-data-protectionを含む最新SHA reviewを全件GOにする。

2026-08-07T22:10:52Zに`Kazuya-Sakashita`が、binding v3、必須browser header、条件付きelapsed bucket
契約を含む19件（error 14 / warning 5）のexact report SHA-256
`b44a1678c98362151a61d0d7ebbdf64c7eabc678e2e0b41dd3d5f9f319a99a8e`だけを明示承認した。
旧16件reportの承認は`superseded`とし、最新hashへ再利用しない。
exact-report waiver、保護label、最新SHAの専門reviewとCIのいずれかが欠けた場合は、引き続きPRをHOLDする。

## Rollback

ProductEvent ingestだけを緊急停止する場合は、保護Environmentから二つのactivationのどちらか一方を外し、
認証やDB writeより前に503へ戻す。再有効化はGitHub Issue #379とISSUE-185のreadinessを両方再検証した後に限る。
障害時はこのPRをrevertし、client、OpenAPI、generated type、両Route Handlerを同じrelease unitで旧版へ
戻す。serverだけ旧raw requestへ戻したり、v1とv2を同時受理したりしない。revert後はOpenAPI lint / gen、
request契約test、auth境界testを再実行し、raw payloadがproduction telemetryへ送られていないことを確認する。

## Consequences

- raw Web Vitals値や動的pathをserverへ送らず、公開endpointへsession cookieを添付しない。
- ProductEvent outboxのactor誤帰属とreceipt timeによるwindow短縮をfail closedにできる。
- refresh token rotationでは同じ認証sessionの未ack eventを保持し、別sessionへは継承しない。
- keyed samplingのsecretを知る主体だけが期待集合を再現でき、key versionまたはsecret commitment不一致を成功扱いしない。
- 旧clientとの互換性よりprivacyを優先するため、原子的なclient/server rolloutが必須になる。
- production DB authorityとretention activationはGitHub Issue #379、全key version退会purgeとHMAC key lifecycleは
  ISSUE-185の独立した承認境界とし、両方のversioned activationが揃うまでproduction telemetry activationをHOLDにする。
- Web Vitals edge attestationと共有rate limitはGitHub Issue #380の独立した承認境界とする。
