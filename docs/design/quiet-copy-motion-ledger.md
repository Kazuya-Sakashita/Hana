# Hana Quiet Copy And Motion Ledger

この文書は `ISSUE-058` で本格整備する copy / motion ledger の最小テンプレート。
`ISSUE-053` 時点では、後続 redesign が文言や motion を勝手に増やさないための
安全な記録形式だけを固定する。

## Rules

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、storage_key、prompt、AI 生成本文を残さない
- AI 生成品質の証跡は本文全文ではなく、分類、違和感、rubric score で残す
- consent、training-use、retention、delete / restore の文言は各 evidence doc を優先する
- `HTTP status` や internal reason を active UI に直接出さない
- motion は `prefers-reduced-motion` で意味が失われないことを条件にする

## Ledger Format

| surface | state | adopted copy / motion | intent | blocked wording / motion | evidence-safe note | review |
| ------- | ----- | --------------------- | ------ | ------------------------ | ------------------ | ------ |
| TBD     | TBD   | TBD                   | TBD    | TBD                      | synthetic only     | TBD    |

## Safe Evidence Fields

PR や design review に残してよいのは以下に限定する。

- screen / surface name
- state name
- synthetic child name such as `はな` / `あお`
- non-sensitive UI label
- rubric score
- timing bucket such as `under_30s`, `30_to_60s`, `over_60s`
- error reason category without request body
- screenshot path from local synthetic data

## Unsafe Evidence Fields

以下は ledger、PR body、screenshot description、review note に残さない。

- real child / parent name
- email, birthdate, address, raw location
- image URL, presigned URL, storage_key
- prompt body
- AI generated memory text
- request / response body containing user content
