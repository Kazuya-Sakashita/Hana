# Hana Design Inventory And Rebuild Roadmap

この文書は `ISSUE-045` の成果物として、現行 Hana アプリの画面と状態を棚卸しし、
どの順番でデザイン再構築へ進むべきかを整理する。

## Scope

| item              | 内容                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| reviewed date     | 2026-07-23                                                                                      |
| source            | `src/app/`, `src/components/`, `src/features/*/client`, `Hana_PRD_v1.md`, `docs/design/`        |
| review method     | コードリーディングと read-only サブエージェントレビュー。実ユーザー画面のスクリーンショットなし |
| implementation    | この Issue では UI 実装をしない                                                                 |
| evidence boundary | 実データ、子どもの写真、画像 URL、`storage_key`、AI 生成本文、prompt 本文を証跡に残さない       |

## Overall Verdict

**Hold**。

現行 UI は MVP の主要導線をかなり実装できている。ホーム、記録、アルバム、記録詳細は
Hana の「私的なアルバム」方向に寄っており、Server Component / Suspense / skeleton /
optimistic update も入っている。

ただし、再構築実装へ進む前に P0 の設計負債を解く必要がある。

- `Task Success / 30秒記録`: `/record` は完了できるが、写真、アップロード、AI、任意本文、日付、天気、保存が一画面に並び、30秒体験の証跡がない
- `Privacy Trust`: AI 同意 copy の「学習に使われない」表現は、vendor retention / training-use の根拠または waiver と合わせる必要がある
- `Privacy Trust`: 削除 dialog は 7日復元を説明するが、復元 UI / restore flow が棚卸し上は確認できない
- `Accessibility / Mobile`: 低コントラスト token、dialog focus 管理、viewport zoom lock、写真 alt 方針が Hold
- `Evidence`: 画面 QA は synthetic data の証跡セットがまだない

No-Go に相当する、PR 証跡上の PII / image URL / `storage_key` / AI 生成本文の露出は
今回の棚卸しでは見つけていない。ただし、実装 PR では毎回 evidence policy を確認する。

## Current Screen Inventory

| surface                   | current state                                                                          | strengths                                                                         | gaps / risks                                                                                                               | verdict | priority |
| ------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `/sign-in`                | Google OAuth の単一 CTA。中央 card で error 表示あり                                   | 入口が短く、過度な説明がない                                                      | CTA が thumb zone から遠い。raw auth error の見え方は copy ledger で確認が必要                                             | Hold    | P2       |
| `/onboarding`             | 子どもの名前と生年月日を登録。既存 child / success / error / loading 状態あり          | 入力は最小。失敗時も責めない                                                      | 既存 child 状態で生年月日を画面表示するため、レビュー証跡は synthetic data 限定。初回記録への感情的な接続は弱い            | Hold    | P1       |
| `/` home                  | greeting、記録 CTA、最近のページ横 scroll、空状態、簡易 stats                          | 30秒価値を明示し、未記録日や streak を出さない                                    | `これまでの あゆみ` のページ数は取得済み recent 件数に依存する。復帰時 copy が圧に見えないか synthetic review が必要       | Hold    | P1       |
| `/record`                 | 写真選択、client re-encode、upload、AI CTA、AI 同意 dialog、編集、保存、キャンセル確認 | MVP の中核 flow が一画面で完了する。AI は提案として編集可能。キャンセル確認もある | 認知負荷が高く 30秒証跡なし。AI は手動 CTA で PRD の自動生成案と差分あり。保存成功は album 遷移頼みで達成感が弱い          | Hold    | P0       |
| AI consent state          | 初回 AI 生成時に modal。外側 click で閉じず、同意 / AI を使わないを明示                | 同意を隠していない。name / age を送ることも UI で説明している                     | 「学習にもつかわれません」は vendor evidence と接続が必要。dialog が `settings` で変更可能と言うが設定画面に項目がない     | Hold    | P0       |
| upload / AI / save errors | upload, AI, validation, save failure の text と toast がある                           | 失敗後に入力へ戻す処理がある                                                      | `HTTP status` や `reason` など技術語が出る箇所があり、親向け copy と evidence policy で整える必要がある                    | Hold    | P1       |
| `/album`                  | Server fetch limit 50、client list、empty state、favorite toggle                       | feed 化を抑え、記録を一覧できる。空状態は責めない                                 | next cursor は initial data にあるが、load more UI / pagination QA がない。多件数で「全部見える」証跡が必要                | Hold    | P0       |
| `/memory/[memoryId]`      | hero photo、meta、title/body、favorite、disabled edit、delete dialog                   | 写真と本文の読ませ方は Hana らしい。削除確認があり即時破壊に見えにくい            | 「ことばをなおす」が disabled。delete copy は 7日復元を約束するため restore flow と整合が必要。写真 alt policy が未定義    | Hold    | P0       |
| `/settings`               | child summary、account email、future items、sign out                                   | 最小構成で迷いにくい                                                              | AI 同意 status / privacy data / export / account deletion / family sharing の信頼操作が未配置                              | Hold    | P1       |
| Bottom navigation         | home / album / settings + center record                                                | 記録 CTA が常時あり、safe area 対応あり                                           | glyph が text symbol で icon system と揃っていない。record は hidden path のため集中 flow は保てているが、a11y QA は未確認 | Hold    | P2       |
| loading / skeleton        | app global loading、album loading、memory loading、home Suspense skeleton              | warm tone skeleton で CLS を抑える意図がある                                      | すべての async surface の synthetic screenshot と screen reader 挙動が未確認                                               | Hold    | P1       |
| dialog / toast foundation | AI consent、cancel confirm、delete confirm、toast provider                             | destructive 操作に確認があり、toast で復帰を知らせる                              | focus trap、initial focus、Escape、background scroll lock が未確認                                                         | Hold    | P0       |
| visual tokens             | washi canvas、serif story text、sakura accent、hairline、soft shadow                   | Hana らしい温度と一貫性がある                                                     | `ink-tertiary`、`amber`、`leaf` が small text で低コントラスト。カード半径 20px は Hana token として使う範囲を再確認する   | Hold    | P0       |
| photo display             | album thumbnail alt は title、detail hero photo alt は empty                           | private memory photo を過度に説明しない方向はあり得る                             | 写真 alt を「説明しすぎない privacy」と「読み上げ可能性」のどちらへ寄せるか policy が未定義                                | Hold    | P0       |

## Rubric Scorecard

| axis                          | score | evidence / gap                                                                                      | gate    |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------- | ------- |
| Task Success / 30秒記録       | 3     | 写真から保存まで到達できるが、手動 AI CTA、任意入力、成功 feedback、時間計測が未整理                | Hold    |
| Forgiving UX                  | 4     | empty / cancel / error は責めない方向。streak や未記録日の圧は見当たらない                          | Warning |
| Emotional Resonance           | 4     | serif story、photo-first detail、アルバム感はある。保存成功後の「記憶になった」感は弱い             | Warning |
| Privacy Trust                 | 3     | 同意は明示。vendor evidence、delete restore copy、settings privacy surface が不足                   | Hold    |
| Content Safety / AI Quietness | 3     | AI は保存後 content label として押し出さないが、record flow の AI CTA / error copy はまだ機械感あり | Warning |
| Accessibility / Mobile        | 2     | zoom lock、低コントラスト、dialog keyboard/focus、photo alt policy が未解決                         | Hold    |
| Visual / Brand Consistency    | 4     | warm canvas、serif、soft card、album-not-feed は一貫。glyph / state variants は未統一               | Warning |
| Performance Perception        | 4     | RSC / Suspense / skeleton / optimistic update がある。AI 待ち時間の感情設計は未検証                 | Warning |
| Engineering Feasibility       | 4     | 1 Issue 1 PR に分割できる。OpenAPI/DB/API 影響は follow-up ごとに明確化可能                         | Pass    |

Go 判定には、少なくとも `Task Success / 30秒記録` と `Privacy Trust` を 4 以上、
`Accessibility / Mobile` を 3 以上へ上げる必要がある。

## PRD / V0 Gap Summary

| principle                 | current alignment                                        | gap                                                                                            |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 30秒で記録                | 写真選択、AI、保存の機能はある                           | 1画面の認知負荷と手動 AI CTA により、30秒 flow としては未証跡                                  |
| 責めない                  | 未記録日、streak、恐怖訴求は出していない                 | home の促し copy と empty / error copy は synthetic review で圧を確認                          |
| 完璧を求めない            | 「1まい」「ひとことだけでも」方向の copy がある          | 写真選択前に「ありのままの日常でよい」安心を明示する余地がある                                 |
| 黒子としての AI           | 保存後の detail / album では AI label を押し出していない | AI consent は明示が必要。record では「AI でつくる」の強さと編集可能性の伝え方を調整する        |
| Mobile-first / one-handed | max-width mobile、bottom nav、large button はある        | sign-in/onboarding/record の primary action が常に bottom 35% とは限らない                     |
| 私的なアルバム            | album/detail は feed/social ではない                     | 多件数表示、pagination、detail transition、month recap はまだ再構築候補                        |
| Trust surface             | AI consent dialog、delete confirm、sign out はある       | privacy/data/AI consent/export/account deletion/family sharing の設定面が future text に留まる |
| loading / empty / error   | skeleton と gentle copy はある                           | すべての状態を synthetic screenshot / keyboard / screen reader で確認できていない              |

## Rebuild Roadmap

### P0: Implementation Gate

| candidate               | target                              | size | scope                                                                                             | done when                                                                           |
| ----------------------- | ----------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DESIGN-FOLLOWUP-P0-01` | Accessibility safety baseline       | M    | zoom lock removal plan、contrast token delta、dialog focus/keyboard spec、photo alt policy        | WCAG contrast target、keyboard checklist、synthetic screenshot set、rollback が揃う |
| `DESIGN-FOLLOWUP-P0-02` | `/record` 30秒 flow redesign        | M    | 写真選択から保存成功までの情報設計、AI skip/edit、保存完了 feedback、manual timing plan           | 30秒手動計測手順と redesigned flow があり、P0 trust copy と矛盾しない               |
| `DESIGN-FOLLOWUP-P0-03` | AI consent / privacy evidence align | S    | vendor training / retention evidence、UI copy、settings 変更導線、PR evidence policy              | 「学習に使われない」等の claims が根拠または明示 waiver と一致する                  |
| `DESIGN-FOLLOWUP-P0-04` | Delete / restore trust contract     | S    | 7日復元 copy と restore UI / API / support flow の整合、または copy の保守的修正                  | ユーザーに復元可能性を過剰約束しない                                                |
| `DESIGN-FOLLOWUP-P0-05` | Album full-list QA                  | S    | 50件上限、next cursor、load more / pagination、home recent carousel、一覧表示の synthetic data QA | 多件数で「最近の一つしか見えない」系の再発を検出できる証跡がある                    |

### P1: Trust And Product Polish

| candidate               | target                               | size | scope                                                                                    | done when                                                                   |
| ----------------------- | ------------------------------------ | ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `DESIGN-FOLLOWUP-P1-01` | Settings privacy center              | M    | AI consent status、privacy/data、export、account deletion、family sharing 予告の情報設計 | settings が trust surface として成立し、実装 Issue に分割できる             |
| `DESIGN-FOLLOWUP-P1-02` | Memory edit entry                    | S    | disabled edit の扱い、編集 flow の入口、失敗時の戻り方                                   | detail の未実装表示が信頼を削らず、実装 scope が半日から2日に収まる         |
| `DESIGN-FOLLOWUP-P1-03` | Empty / loading / error state system | M    | 全画面の状態 copy、toast/dialog variants、technical reason を親向け copy に変換する方針  | state 別 screenshot と copy ledger があり、責めない・漏らさないが確認できる |
| `DESIGN-FOLLOWUP-P1-04` | Home archive count and return copy   | S    | recent 件数と総記録数の扱い、復帰時の促し copy、empty home の温度                        | count が誤解を生まず、「おかえり」方向の copy で統一される                  |
| `DESIGN-FOLLOWUP-P1-05` | Onboarding to first memory bridge    | S    | 登録成功から最初の記録への感情的な誘導、permission / AI consent の出し方                 | 初回登録から初回記録までの flow が 5分以内に説明・検証できる                |

### P2: Brand System Expansion

| candidate               | target                         | size | scope                                                                      | done when                                               |
| ----------------------- | ------------------------------ | ---- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `DESIGN-FOLLOWUP-P2-01` | Icon and action language       | S    | bottom nav、back、record plus、favorite、delete、edit の icon / label 統一 | text glyph と lucide / icon set の使い分けが documented |
| `DESIGN-FOLLOWUP-P2-02` | Album-not-feed visual polish   | M    | card density、thumbnail ratio、detail transition、private album 感         | SNS/feed 的に見えない visual QA criteria がある         |
| `DESIGN-FOLLOWUP-P2-03` | Motion language                | S    | reduced motion、AI waiting、page transition、save success の motion rule   | motion が静かで、reduced-motion でも成立する            |
| `DESIGN-FOLLOWUP-P2-04` | Monthly recap / future surface | M    | recap、premium、family sharing の design backlog を現行 MVP から切り出す   | MVP と v1+ の境界が design backlog として追跡できる     |

## Required Design Artifacts Before Implementation

各 follow-up の実装前に、該当するものを Issue / PR に添付する。

- Synthetic screenshot set: `/sign-in`, `/onboarding`, `/`, `/record`, AI consent, upload failure, AI failure, save failure, `/album` empty/many, `/memory/[memoryId]`, delete dialog, `/settings`
- Copy ledger: 表示文言、許可する child given-name の使い方、AI prompt / PR evidence / screenshot artifact で禁止する full name / birthdate / email / location / image URL / `storage_key` / prompt / AI 生成本文
- Flow map: happy path、cancel、retry、delete、sign out、AI skip、permission / consent
- Accessibility report: contrast、44px tap target、focus order、dialog keyboard、Escape、screen reader label、photo alt policy、zoom
- Privacy / Trust ledger: AI vendor evidence、data retention、training-use、delete/restore、share/family settings、PR evidence policy
- Design token / component delta: token changes、button/card/dialog/toast/state component の変更点
- Manual QA plan: mobile 390px / 430px / 768px / 1280px、keyboard、reduced motion、synthetic data setup
- Rollback plan: copy only、CSS only、component foundation、API/DB/storage 影響の有無を PR ごとに明記

Figma を使う場合は、画面だけではなく状態別 component、copy table、a11y note、
privacy note を同じ design file に置く。Figma がない場合も、同等の静的成果物を
`docs/design/` に残してから実装へ進む。

## Subagent Review Order

再構築 follow-up は、次の順でレビューする。

| order | reviewer                         | main question                                                                                       | gate                                                             |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | Product UX / HEART               | 30秒記録、復帰しやすさ、初回価値、見返したくなる温度が成立するか                                    | Task Success 4 以上。Happiness / Retention を圧で作っていない    |
| 2     | Privacy / Trust / Content Safety | 写真、AI 同意、削除、共有、証跡が不安や漏洩を増やさないか                                           | Privacy Trust 4 以上。PII / URL / `storage_key` / AI本文露出なし |
| 3     | Visual / A11y / Engineering      | mobile、contrast、focus、component reuse、performance perception、1 Issue 1 PR feasibility があるか | Accessibility 3 以上。P0 blocker がない                          |
| 4     | Senior Engineer PR Review        | scope creep、testability、rollback、docs / implementation consistency を保てるか                    | 最大3回の修正レビューで blocker がなくなる                       |

Privacy Trust、Content Safety、Accessibility、Task Success の blocker は平均点で相殺しない。
いずれかが No-Go の場合、visual polish や brand score が高くても実装へ進まない。

## Review Ledger

| reviewer                         | result                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Product UX / Task Success        | `/record` の認知負荷、保存成功の達成感、settings trust surface、album 多件数証跡を P0/P1 として指摘                |
| Privacy / Trust / Content Safety | AI vendor claim、client-side signed URL / `storage_key` の証跡管理、delete restore copy、synthetic evidence を指摘 |
| Visual / A11y / Engineering      | token contrast、dialog focus、zoom lock、glyph/icon system、photo alt policy、RSC/Suspense の強みを指摘            |

## Evidence Policy

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文を貼らない
- child name が必要な UI 証跡は `はな` / `あお` のような synthetic name を使う
- screenshot は local / test seed のみ。production や個人 account の画面を使わない
- AI 生成品質は本文の全文貼り付けではなく、分類、違和感、再現条件、rubric score で残す
- PR body には evidence policy の確認結果を必ず書く
