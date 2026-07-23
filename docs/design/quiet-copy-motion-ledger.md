# Hana 静かな文言とモーション台帳

この文書は `ISSUE-058` で整備した copy / motion ledger。
後続 redesign が文言や motion を勝手に増やさないため、active UI に出してよい状態文言と
禁止する技術文言、証跡として残してよい情報をここに固定する。

## ルール

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、storage_key、prompt、AI 生成本文を残さない
- AI 生成品質の証跡は本文全文ではなく、分類、違和感、rubric score で残す
- consent、training-use、retention、delete / restore の文言は各 evidence doc を優先する
- `HTTP status` や internal reason を active UI に直接出さない
- motion は `prefers-reduced-motion` で意味が失われないことを条件にする

## 台帳

| 画面 / surface | 状態                                     | 採用文言 / motion                                                                                              | 意図                                                   | 禁止文言 / motion                           | 安全な証跡メモ                            | review    |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------- | --------- |
| 共通 shell     | loading                                  | `ページを ひらいています…`                                                                                     | 画面遷移の待ち時間を短く、責めずに伝える               | `Loading...`、spinner だけ、処理名の露出    | `state=loading`                           | ISSUE-058 |
| 共通 shell     | open error                               | `うまく ひらけませんでした` / `ネットワークの ちょうしを たしかめて、もういちど ためしてください。`            | 失敗をユーザーの責任にしない                           | HTTP status、internal reason、stack trace   | `state=open_error`, reason category only  | ISSUE-058 |
| sign-in        | OAuth pending                            | `Google に つないでいます…`                                                                                    | 何が起きているかを短く伝える                           | `...` だけ、provider error message の直出し | `surface=sign_in`, `state=pending`        | ISSUE-058 |
| sign-in        | OAuth failure                            | `サインインを はじめられませんでした。少しおいて、もういちど ためしてください。`                               | OAuth の raw error を出さず復帰先を示す                | `error.message` の直出し                    | `error_category=oauth_start_failed`       | ISSUE-058 |
| onboarding     | save pending                             | `ページを 用意しています…`                                                                                     | 子どもプロフィール登録を事務処理に見せない             | `保存中...` だけ                            | `state=profile_save_pending`              | ISSUE-058 |
| onboarding     | save failure                             | `入力はそのままなので、もういちど ためしてください。` を含む復帰 copy                                          | 入力喪失がないことを先に伝える                         | `(${reason})`、validation reason の直出し   | field name only, no birthdate value       | ISSUE-058 |
| record         | photo preparing / uploading / confirming | `しゃしんを ひらいています…` / `しゃしんを たいせつに あずかっています…` / `ページに のせる 準備をしています…` | upload を storage 作業ではなく記録準備として伝える     | `Storage`, `signed URL`, `HTTP 4xx/5xx`     | `state=upload_*`, no URL/key              | ISSUE-058 |
| record         | photo upload failure                     | `しゃしんを 受けとれませんでした。写真を かえて、もういちど ためしてください。`                                | 技術エラーではなく次の行動を示す                       | `HTTP ${status}`、storage provider message  | `error_category=upload_failed`            | ISSUE-058 |
| record         | AI waiting                               | `ページに そえる ことばを 探しています…` + `motion-safe:animate-pulse` の補助文                                | AI を魔法演出にせず、待ち時間の意味を静かに伝える      | 派手な魔法演出、AI が主役の copy            | `state=ai_generating`, timing bucket only | ISSUE-058 |
| record         | AI failure / quota                       | `AI を使わずに、このまま残せます。` を含む復帰 copy                                                            | AI 失敗で記録を止めない                                | `ai_quota_exceeded` 等の reason 直出し      | `error_category=ai_unavailable`           | ISSUE-058 |
| record         | save pending / success                   | `ページを しまっています…` / `ページを しまいました`                                                           | 保存を「しまう / ならべる」比喩で keepsake に合わせる  | 達成圧、streak、派手な success animation    | `state=save_success`, timing bucket only  | ISSUE-058 |
| record         | save failure                             | `入力はそのままです。もういちど ためしてください。`                                                            | 失敗時の復帰可能性を最優先に伝える                     | `(${reason})`、request body の露出          | `error_category=save_failed`              | ISSUE-058 |
| album          | empty / load more                        | `きょうの 1 まいから、はじめましょう。` / `まえのページも みる`                                                | 記録ゼロや多件数を圧にしない                           | 未記録日数、streak、競争表現                | count bucket only                         | ISSUE-058 |
| album          | favorite failure toast                   | `しるしを かえられませんでした` / `ページはそのままです。もういちど ためしてください。`                        | お気に入りを評価・ランキングではなく私的なしるしにする | technical reason、競争表現                  | `error_category=favorite_failed`          | ISSUE-058 |
| memory detail  | delete dialog                            | `アルバムに 表示されなくなります。`                                                                            | 復元や完全削除を過剰約束しない                         | `完全に削除`, 未実装 restore promise        | `state=delete_confirm`                    | ISSUE-058 |
| memory detail  | delete failure toast                     | `ページを しまい直しました` / `アルバムに もどしました。もういちど ためしてください。`                         | 失敗後の現在地を静かに伝える                           | `delete_failed` 等の reason 直出し          | `error_category=delete_failed`            | ISSUE-058 |
| settings       | AI data boundary                         | `文章をつくるときだけ...` / `おくるもの` / `おくらないもの`                                                    | 実装済みの privacy boundary を短く示す                 | training / retention の断定的過剰保証       | field category only                       | ISSUE-058 |

## Motion ルール

- AI waiting は `motion-safe:animate-pulse` の控えめな補助表示に留める
- save success は toast の短い feedback と album 遷移で示し、派手な演出を足さない
- reduced motion では文言と遷移だけで意味が伝わることを優先する
- skeleton / placeholder の追加 motion は、形状一致と CLS への影響を確認してから使う

## 残してよい証跡フィールド

PR や design review に残してよいのは以下に限定する。

- screen / surface name
- state name
- synthetic child name such as `はな` / `あお`
- non-sensitive UI label
- rubric score
- timing bucket such as `under_30s`, `30_to_60s`, `over_60s`
- error reason category without request body
- screenshot path from local synthetic data

## 残してはいけない証跡フィールド

以下は ledger、PR body、screenshot description、review note に残さない。

- real child / parent name
- email, birthdate, address, raw location
- image URL, presigned URL, storage_key
- prompt body
- AI generated memory text
- request / response body containing user content
