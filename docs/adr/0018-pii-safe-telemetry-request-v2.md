# 0018. Telemetry requestをPII-safe v2へ原子的に切り替える

- Status: proposed
- Date: 2026-08-07
- Deciders: human approval required
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
- Web Vitals senderは`fetch`の`credentials: omit`と`keepalive`だけを使い、`sendBeacon`を使わない。
- Web Vitals serverはv2のexact fixed shapeだけを受理し、rate limit後・validation後・log前にstable 10%
  samplingを適用する。
- ProductEvent bodyへretry中も不変の`occurred_minute_utc`を追加する。
- `GET /me`が返すserver-minted opaque bindingをProductEvent headerに必須化し、現在の認証actorと
  constant-timeで一致する場合だけingestへ進む。
- outboxはbindingをrootに1つだけ保持し、active actorが一致しない場合は送信前に全件破棄する。
- binding、event ID、raw metric、path、actor hashは通常logやstatus-only evidenceへ出さない。

## Compatibility and approval

旧requestを送るclientは422または403になるため、これは意図したbreaking changeである。採用には次を
すべて必須とする。

1. OpenAPI-first差分、生成型、client、server、契約testを同じPR head SHAへ固定する。
2. `oasdiff` exact report hashへ限定したunexpired waiverを記録する。
3. 人間が`openapi-breaking-approved` labelを付与する。
4. api-contract / security-authorization / privacy-data-protectionを含む最新SHA reviewを全件GOにする。

上記が揃うまで本ADRはproposedであり、PRはHOLDである。

## Rollback

障害時はこのPRをrevertし、client、OpenAPI、generated type、両Route Handlerを同じrelease unitで旧版へ
戻す。serverだけ旧raw requestへ戻したり、v1とv2を同時受理したりしない。revert後はOpenAPI lint / gen、
request契約test、auth境界testを再実行し、raw payloadがproduction telemetryへ送られていないことを確認する。

## Consequences

- raw Web Vitals値や動的pathをserverへ送らず、公開endpointへsession cookieを添付しない。
- ProductEvent outboxのactor誤帰属とreceipt timeによるwindow短縮をfail closedにできる。
- 旧clientとの互換性よりprivacyを優先するため、原子的なclient/server rolloutが必須になる。
- production DB authorityとretention activationはGitHub Issue #379の独立した承認境界で、完了まで
  production telemetry activationをHOLDにする。
