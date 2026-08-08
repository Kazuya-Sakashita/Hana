# 0020. Telemetry evidenceの最終Round 5所見を新しい証跡で解消する

- Status: accepted
- Date: 2026-08-09
- Deciders: Kazuya-Sakashita
- Related: ISSUE-191 / GitHub Issue #385
- Supersedes implementation and review evidence from: ISSUE-188 / GitHub Issue #381 / PR #382

## Context

ISSUE-188のPR #382は最終Review Round 5でHOLDになった。Round 6は常にHOLDであり、同じPRへ修正を
追加して合格させることはできない。最終所見を重複排除すると、metric別の観測窓、funnel completeness、
target decision、sealed universe chronology、Memory actor ownership、protected actor key versionの6修正単位になった。

公開OpenAPIの候補差分はISSUE-188と同じだが、ISSUE-188のreview、例外proof、waiverをISSUE-191の合格証拠へ
流用すると、失敗したhead SHAと新しい実装証跡の境界が失われる。このためISSUE-191は新しい通常Review Round 1、
新しいADR、新しい期限付きexact-report waiverを必須とする。

## Decision

- M1〜M9はmetricごとに固定anchor、entry window、maturity ruleとcutoffを持つexact private manifest v2を使う。
  callerによる期間短縮、境界変更、maturity前集計をHOLDにする。
- funnel completenessがPASSでない場合、event依存のM2 / M3 / M8 / M9はすべて
  `HOLD/telemetry_incomplete`にする。独立metricの状態は変更しない。
- M8 / M9のtarget decisionは`at_or_above`方向、再計測期限、evaluation window、baseline cohort role、
  署名済みbaseline evidence receiptを拘束し、baseline生成からtarget固定、評価開始までの順序を検証する。
- sealed universe chronologyは、正しく再署名したPASS対照を起点に、cutoff mismatchとseal-before-cutoffだけを
  それぞれ変異させてHOLDを検証する。
- M2 / M3 / M9の署名済みMemory exact setは、評価対象flow以外の行も含めて全行を期待synthetic actorへ限定する。
- `actor_key_version`は保護された環境構成から取得し、private manifestとstatus-only evidenceへ完全一致させる。
  caller指定値、未設定、未知形式、PII様値を拒否する。
- query、evidence、metric policy、target policy、manifestのversionを更新し、ISSUE-188およびRound 1の署名済み証跡を受理しない。
- status-only evidence全体は保護されたevidence keyと専用domainのHMACで署名し、固定status / reasonを含む出力改ざんを拒否する。
- status-only evidenceにはraw event、actor、exact count、rate、子どもの情報を含めない。

## Compatibility and approval

OpenAPIはbare UUID、必須telemetry binding header、`occurred_minute_utc`、同一origin Web Vitals headerと
固定dimensionを要求するため、旧clientは422または403になる。client、server、OpenAPI、生成型を同じrelease unitで
切り替える原子的なbreaking changeとして扱う。

mainとの差分によるexact `oasdiff` reportは21件（error 16 / warning 5）、GitHub Action互換の改行正規化後
SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`である。
2026-08-08T21:47:55Zに`Kazuya-Sakashita`がISSUE-191のこのexact reportだけを明示承認した。

ISSUE-188の同一hash waiverは`superseded`にし、ISSUE-191名義の期限付きwaiver、保護された
`openapi-breaking-approved` label、固定base / head SHAの6 role review、CI成功が揃うまでHOLDする。

## Consequences

- callerがmetricごとの期間、maturity、funnel completeness、target baselineを改変して早期GOを作れない。
- 別actorのMemory行を別flowへ置いてexact setを満たすことや、actor key versionへ任意値を混入することを防げる。
- 旧clientは新しい必須headerとpayloadへ同時更新する必要があり、段階的な互換rolloutはできない。
- ISSUE-188の失敗したreview証跡から分離された固定SHAで、通常3巡以内のfresh reviewを実施できる。

## Rollback

production telemetry activationをHOLDしたままPR全体をrevertする。OpenAPI、client、server、生成型、query versionを
部分的に戻さず、旧query versionや署名済みevidenceを再利用しない。revert後はOpenAPI lint / gen、契約test、
privacy / authorization testを同じcommitで再実行する。
