# 0021. Telemetry metric truthをevidence signerから分離する

- Status: accepted
- Date: 2026-08-09
- Deciders: Kazuya-Sakashita
- Related: ISSUE-192 / GitHub Issue #387
- Supersedes active evidence lineage from: ADR-0020 / ISSUE-191 / PR #386

## Context

PR #386の固定SHA Round 3で、evidence builderがcaller指定のsource SHA、生成時刻、eligible / success / censorを検査後にevidence keyで署名できることが判明した。HMAC自体は改変を防ぐが、署名前のclaimがauthoritative DB / Memory truthへ拘束されなければ、signerが真正性を付与するoracleになる。

同じreviewで、funnel authorityが必須5 operationの一部だけでも成立し、ISSUE-162のrelease dossierがwhole-artifact検証を受け入れ条件にしていないことも確認された。Round 3はterminal HOLDであるため、PR #386を修正せずISSUE-192へ置換する。

## Decision

- evidence builderは`source_sha`と`generated_at_utc`をinputから削除し、`TELEMETRY_DEPLOYMENT_SHA`とsigner clockから導出する。
- eligible census / censoring statusをinputから削除し、別keyで署名されたmetric aggregate receiptから再構成する。
- aggregate receiptはquery、deployment SHA、生成時刻、actor key version、cohort role、window、metric、必須5 operation、authority / universe commitment、private cohort commitment、DB / Memory truth commitment、eligible / success / censorを署名する。
- M2 / M3 / M8 / M9はMemory truth commitmentを必須とする。M2 / M3 / M7はdistinct profileとeligible unitの不変条件も検証する。
- funnel evidenceは必須5 operationのexact setをauthority registrationとsealed universeの両方で確認する。
- status-only evidenceはaggregate receipt本体や件数を含めず、receipt set、eligible census、censoring statusのdomain-separated commitmentだけを持つ。
- queryを`issue-192-v1`、evidence schemaを`hana-telemetry-evidence/v7`へ更新し、ISSUE-191の証跡を受理しない。
- ISSUE-162はhuman review前にv7 whole-artifact HMAC、exact M1-M12、nested schema、completeness伝播、全体status、対象main SHA、evaluation roleを検証し、1項目でも不成立ならHoldにする。

## Compatibility and approval

公開OpenAPI差分はISSUE-191と同じ候補だが、ISSUE-191のexact report承認、waiver、labelはISSUE-192へ転用しない。新しいbase / headからreportを生成し、人間がそのexact reportを承認するまでbreaking gateをHOLDする。

`origin/main`との差分を固定oasdiff imageで再生成した結果は21件（error 16 / warning 5）であり、GitHub Action互換の改行正規化後exact report SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`である。同じhashであってもISSUE-191の承認は流用せず、ISSUE-192名義のwaiverは人間承認まで`proposed`とする。

## Consequences

- application callerはevidence keyだけでは任意SHA、未来時刻、未認証countへ真正性を付与できない。
- aggregate query / receipt signerはevidence signerと別key・別責務になり、private truthはstatus-only境界の外に残る。
- 必須operation欠落やDB / Memory truth欠落は、正しく署名された他の入力があってもfail closedになる。
- protected deployment SHA、aggregate key / versionの配布が不足する環境ではevidence生成を行わない。

## Rollback

production telemetry activationをHOLDしたままPR全体をrevertする。v7からv6への部分的fallback、ISSUE-191 receipt / waiverの再利用、evidence keyによるaggregate claimの代替署名は行わない。
