# Hana Issue Index

このファイルは `docs/issues/ISSUE-*.md` の frontmatter から生成されます。直接編集せず、`pnpm issues:write` を実行してください。

- Issue本文の正本: `docs/issues/ISSUE-<number>[suffix]-*.md`
- 検証: `pnpm issues:check`
- GitHub状態照合: `pnpm issues:check-github -- --github-status-file <status-only.json>`
- GitHubから扱う情報: Issue番号と `OPEN` / `CLOSED` のみ

## Status Snapshot

| status | count |
| --- | ---: |
| `todo` | 6 |
| `in_progress` | 1 |
| `review` | 8 |
| `done` | 150 |
| `blocked` | 7 |

## Codex Ready Queue

| Issue | GitHub | status | priority | size | title | blocked_by |
| --- | ---: | --- | --- | --- | --- | --- |
| `ISSUE-151` | `#321` | `todo` | P1 | M | DB least-privilegeとRLSのtracer bulletを実装する | - |
| `ISSUE-152` | `#322` | `todo` | P1 | M | PII-safe telemetry集約基盤を作る | - |
| `ISSUE-155` | `#323` | `todo` | P0 | M | confirmed cleanupへlease・backoff・dead-letterを追加する | - |
| `ISSUE-156` | `#324` | `todo` | P1 | M | Critical pathのcoverage・mutation gateを導入する | - |
| `ISSUE-157` | `#325` | `todo` | P1 | M | 現行アプリのVisual・A11y・mobile・cross-browser baselineを作る | - |
| `ISSUE-158` | `#326` | `todo` | P1 | M | route JS・CWV・画像処理のperformance budgetをCIへ追加する | - |

ready条件: `status: todo`、sizeがS/M、`blocked_by` が空またはすべてdone。

## In Progress

| Issue | GitHub | status | priority | size | title | blocked_by |
| --- | ---: | --- | --- | --- | --- | --- |
| `ISSUE-166` | `#338` | `in_progress` | P0 | M | GitHub Rulesetと安全なAuto-mergeを有効化する | - |

## Review Queue

| Issue | GitHub | status | priority | size | title | blocked_by |
| --- | ---: | --- | --- | --- | --- | --- |
| `ISSUE-159` | `#327` | `review` | P1 | M | PRD契約とfunnelのGo・Hold基準を再同期する | - |
| `ISSUE-163` | `#335` | `review` | P1 | S | Loop Engineerの自動マージ方針と危険操作境界を定義する | - |
| `ISSUE-164` | `#336` | `review` | P1 | M | PRの自動マージ適格性を機械判定する | - |
| `ISSUE-165` | `#337` | `review` | P0 | M | 複数専門サブエージェントの独立review gateを実装する | - |
| `ISSUE-168` | `#346` | `review` | P0 | M | GitHub App preflightを通常gh認証から分離する | - |
| `ISSUE-169` | `#348` | `review` | P0 | S | App preflightのpnpm参照先をtrusted checkoutへ固定する | - |
| `ISSUE-171` | `#352` | `review` | P0 | S | Gate evaluationをJSON-onlyで後段へ渡す | - |
| `ISSUE-173` | `#356` | `review` | P0 | M | レビュー上限の人間承認例外をSHAへ束縛する | - |

## Blocked Or Needs Human Decision

| Issue | GitHub | status | priority | size | title | blocked_by |
| --- | ---: | --- | --- | --- | --- | --- |
| `ISSUE-105` | `#234` | `blocked` | P0 | S | staging preflight を実行し公開前 traffic の Go/Hold を判定する | - |
| `ISSUE-153` | `#329` | `blocked` | P0 | M | SLO・alert・synthetic canaryを定義する | ISSUE-105, ISSUE-152 |
| `ISSUE-154` | `#330` | `blocked` | P0 | M | DB・Storage・Authの復旧契約と合成restore drillを作る | ISSUE-105 |
| `ISSUE-160` | `#331` | `blocked` | P0 | M | 5名pilotで30秒記録とAI下書き受容性を検証する | ISSUE-105, ISSUE-152, ISSUE-159, ISSUE-161, ISSUE-185 |
| `ISSUE-161` | `#328` | `blocked` | P0 | S | AI vendorのdata-handling attestationを確定する | - |
| `ISSUE-162` | `#332` | `blocked` | P0 | M | Release evidence dossierと最終Go・No-Goを確定する | ISSUE-105, ISSUE-148, ISSUE-149, ISSUE-150, ISSUE-151, ISSUE-152, ISSUE-153, ISSUE-154, ISSUE-155, ISSUE-156, ISSUE-157, ISSUE-158, ISSUE-159, ISSUE-160, ISSUE-161, ISSUE-185 |
| `ISSUE-185` | `#375` | `blocked` | P0 | M | ProductEventの退会purgeとHMAC key lifecycleを実装する | ISSUE-152 |

## All Issues

| Issue | GitHub | status | priority | size | title | blocked_by |
| --- | ---: | --- | --- | --- | --- | --- |
| `ISSUE-001` | `#1` | `done` | P0 | S | プロジェクト初期設定 | - |
| `ISSUE-002` | `#3` | `done` | P0 | M | OpenAPI 基盤 & ProblemDetails 定義 | - |
| `ISSUE-003` | `#5` | `done` | P0 | S | 型生成パイプライン構築 | - |
| `ISSUE-004` | `#7` | `done` | P0 | M | API クライアント基盤 (openapi-fetch + ProblemDetails 型ガード) | - |
| `ISSUE-005` | `#9` | `done` | P0 | M | Supabase + Prisma 基盤 (DB 接続・スキーマ・migrations) | - |
| `ISSUE-006` | - | `done` | P0 | M | Supabase Auth 統合 (Google 先行、SNS-only) | - |
| `ISSUE-006b` | - | `done` | P1 | S | V0 デザインアセットの参照方針整備（gitignore + プロンプト保管） | - |
| `ISSUE-006c` | - | `done` | P1 | M | デザインシステム導入 (Tailwind v4 + 和紙色トークン + shadcn 最小セット + Noto Serif JP) | - |
| `ISSUE-007` | - | `done` | P0 | M | 子どもプロフィール API (children) + /onboarding 画面 | - |
| `ISSUE-008` | - | `done` | P0 | M | 写真アップロード + Supabase Storage (presigned URL 方式) | - |
| `ISSUE-009` | - | `done` | P0 | M+ | 記録 (Memory) API + /record + /album 画面 | - |
| `ISSUE-010` | - | `done` | P0 | M+ | AI 文章生成統合 (Claude API) | - |
| `ISSUE-012` | - | `done` | P0 | M | ホーム画面 (`/`) を V0 §5.2 ベースに刷新 | - |
| `ISSUE-013` | - | `done` | P0 | M | 記録詳細画面 (/memory/[memoryId]) — "the cry-worthy moment" | - |
| `ISSUE-014` | - | `done` | P1 | S | BottomNav (ホーム / アルバム / せってい + 中央 + ボタン) + /settings 最小 stub | - |
| `ISSUE-014a` | - | `done` | P1 | S | /record にキャンセル動線 (やめる + 確認ダイアログ) を追加 | - |
| `ISSUE-015` | - | `done` | P1 | S | /album にサムネイル表示 | - |
| `ISSUE-016` | - | `done` | P0 | S | パフォーマンス計測ベースラインの取得とドキュメント化 | - |
| `ISSUE-017` | - | `done` | P0 | S | requireUser() を request-scoped cache 化 + profile upsert 廃止 | - |
| `ISSUE-018` | - | `done` | P0 | M | /v1/memories レスポンスに cover_thumbnail_url を含める (BFF 化) | - |
| `ISSUE-019` | - | `done` | P0 | M | 画像 URL の Cache-Control 適正化 + クライアント URL キャッシュ | - |
| `ISSUE-020` | `#70` | `done` | P1 | S | loading.tsx + Link prefetch で体感速度を向上 | - |
| `ISSUE-021` | `#69` | `done` | P1 | S | bundle analyzer 導入 + Noto Serif JP weight 削減 | - |
| `ISSUE-022` | `#75` | `done` | P2 | S | AI generate の画像 DL + sharp resize を並列化 | - |
| `ISSUE-023` | `#71` | `done` | P1 | M | Tanstack Query 導入 + /me /children のグローバルキャッシュ | - |
| `ISSUE-024` | - | `done` | P2 | S | Web Vitals 計測基盤の導入 | - |
| `ISSUE-025` | - | `done` | P1 | M | /album を Server Component 化 (初期データを SSR) | - |
| `ISSUE-026` | - | `done` | P1 | M | / (home) を Server Component 化 (初期データを SSR) | - |
| `ISSUE-027` | - | `done` | P2 | M | /memory/[memoryId] を Server Component 化 (初期データを SSR) | - |
| `ISSUE-028` | `#43` | `done` | P1 | M | 画像表示を next/image に移行 (WebP variants + lazy + priority) | - |
| `ISSUE-029` | `#77` | `done` | P2 | M | 「のこす」「お気に入り」「削除」を optimistic UI に | - |
| `ISSUE-030` | - | `done` | P2 | S | アルバム一覧サムネをホーム「さいきんの ページ」と同じ表示方針に統一 | - |
| `ISSUE-031` | - | `done` | P0 | M | 画像 variant (thumbnail/preview) をアップロード時に sharp で事前生成 | - |
| `ISSUE-032` | `#62` | `done` | P0 | M | MVP release readiness を一元管理する | - |
| `ISSUE-033` | `#58` | `done` | P0 | S | Codex 自動開発 Runbook を整備する | - |
| `ISSUE-034` | `#61` | `done` | P0 | S | Codex 自動開発向け PR gate を CI に追加する | - |
| `ISSUE-035` | `#59` | `done` | P0 | S | Issue index と ready queue を整備する | - |
| `ISSUE-036` | `#60` | `done` | P0 | M | security-and-privacy.md を作成し launch blocker を整理する | - |
| `ISSUE-037` | `#57` | `done` | P1 | M | OpenAPI と Next.js Route Handler の route-map check を追加する | - |
| `ISSUE-038` | `#80` | `done` | P1 | S | 認証済み画像QAをCDPで自動化 | - |
| `ISSUE-039` | `#83` | `done` | P2 | S | Issue Index に merge 済み ISSUE-038 を反映 | - |
| `ISSUE-040` | `#85` | `done` | P1 | S | アルバム一覧が新規保存後に1件だけになる問題を修正 | - |
| `ISSUE-041` | `#87` | `done` | P1 | S | 認証済み実データで ISSUE-028 画像 QA を完了する | - |
| `ISSUE-042` | `#89` | `done` | P2 | S | Review Queue を GitHub の完了状態と同期する | - |
| `ISSUE-043` | `#90` | `done` | P1 | M | Hana デザイン再構築の運営組織とサブエージェント体制を定義する | - |
| `ISSUE-044` | `#91` | `done` | P1 | M | Hana に合うデザイン評価手法を定義する | - |
| `ISSUE-045` | `#92` | `done` | P1 | M | Hana アプリ現行デザインを棚卸しして再構築ロードマップを作る | - |
| `ISSUE-046` | `#97` | `done` | P0 | S | Accessibility token and viewport remediation | - |
| `ISSUE-047` | `#99` | `done` | P0 | S | Dialog accessibility foundation | ISSUE-046 |
| `ISSUE-048` | `#101` | `done` | P0 | S | AI consent privacy evidence alignment | ISSUE-047 |
| `ISSUE-049` | `#103` | `done` | P0 | S | Delete restore trust contract | ISSUE-048 |
| `ISSUE-050` | `#105` | `done` | P0 | S | Memory photo alt privacy policy | ISSUE-049 |
| `ISSUE-051` | `#107` | `done` | P0 | S | Album full-list pagination QA | ISSUE-050 |
| `ISSUE-052` | - | `done` | P2 | S | Post-merge issue status sync | - |
| `ISSUE-053` | `#110` | `done` | P0 | S | Quiet Heirloom デザイン正本 | - |
| `ISSUE-054` | `#111` | `done` | P0 | M | デザイントークンと共通 UI 刷新 | ISSUE-053 |
| `ISSUE-055` | `#112` | `done` | P0 | M | 記録画面の下部シート型 30 秒フロー刷新 | ISSUE-054, ISSUE-058 |
| `ISSUE-056` | `#113` | `done` | P1 | M | ホームの Quiet Heirloom 刷新 | ISSUE-054, ISSUE-058 |
| `ISSUE-057` | `#114` | `done` | P1 | M | アルバムと記録詳細の keepsake 刷新 | ISSUE-054, ISSUE-058 |
| `ISSUE-058` | `#115` | `done` | P0 | M | 状態文言と静かなモーション体系 | ISSUE-054 |
| `ISSUE-059` | `#116` | `done` | P0 | M | デザインモバイル QA とレビューゲート | ISSUE-055, ISSUE-056, ISSUE-057, ISSUE-058 |
| `ISSUE-060` | `#131` | `done` | P0 | M | プロダクト体験 V2: 約束整合と共通シェル基盤 | - |
| `ISSUE-061` | `#132` | `done` | P0 | M | Settings Trust Center v1 | ISSUE-060 |
| `ISSUE-062` | `#134` | `done` | P1 | M | Onboarding to First Memory Bridge | ISSUE-060 |
| `ISSUE-063` | `#133` | `done` | P1 | M | Record Saved Moment and Memory Landing | ISSUE-060 |
| `ISSUE-064` | `#135` | `done` | P0 | M | Product Design QA v2 | ISSUE-060 |
| `ISSUE-065` | `#150` | `done` | P2 | S | ISSUE-041 完了後の状態同期 | - |
| `ISSUE-066` | `#152` | `done` | P0 | S | Quiet Heirloom refinement 設計契約 | - |
| `ISSUE-067` | `#153` | `done` | P1 | M | トークンと共通UIの質感調整 | ISSUE-066 |
| `ISSUE-068` | `#154` | `done` | P1 | M | ホーム first view を写真主役へ調整 | ISSUE-066, ISSUE-067 |
| `ISSUE-069` | `#155` | `done` | P1 | M | 記録画面を1判断ずつの下部シート体験へ調整 | ISSUE-066, ISSUE-067 |
| `ISSUE-070` | `#156` | `done` | P1 | M | アルバムと記録詳細を private shelf 体験へ調整 | ISSUE-066, ISSUE-067 |
| `ISSUE-071` | `#162` | `done` | P0 | M | LP 静的プロトタイプと専門家評価を公開前課題へ整理 | - |
| `ISSUE-072` | `#163` | `done` | P0 | M | LP の実行可能な CV 導線を決めて接続 | - |
| `ISSUE-073` | `#164` | `done` | P0 | M | LP Before / After の価値証拠を強化 | ISSUE-071 |
| `ISSUE-074` | `#165` | `done` | P1 | M | LP Hero を keepsake 主役の構図へ再構成 | ISSUE-071, ISSUE-073 |
| `ISSUE-075` | `#166` | `done` | P0 | M | LP 公開前 QA と trust human review gate | - |
| `ISSUE-076` | `#171` | `done` | P0 | M | LP と本体アプリの視覚語彙を接続する | - |
| `ISSUE-077` | `#173` | `done` | P0 | M | 共通 keepsake primitive と icon language を実装する | ISSUE-076 |
| `ISSUE-078` | `#175` | `done` | P0 | M | Record 30秒 one-decision flow を LP-App visual grammar に合わせる | ISSUE-076, ISSUE-077 |
| `ISSUE-079` | `#177` | `done` | P1 | M | BottomNav と action icon を quiet alignment に合わせる | ISSUE-076, ISSUE-077, ISSUE-078 |
| `ISSUE-080` | `#179` | `done` | P1 | M | Sign-in / Onboarding / Settings trust bridge を整える | ISSUE-076, ISSUE-077, ISSUE-078, ISSUE-079 |
| `ISSUE-081` | `#181` | `done` | P1 | M | Album / Memory Detail private shelf polish を整える | ISSUE-076, ISSUE-077, ISSUE-078, ISSUE-079, ISSUE-080 |
| `ISSUE-082` | `#183` | `done` | P1 | M | LP-App visual parity QA gate を整える | ISSUE-076, ISSUE-077, ISSUE-078, ISSUE-079, ISSUE-080, ISSUE-081 |
| `ISSUE-083` | `#188` | `done` | P1 | S | LP の画像とカードの角丸を Quiet Heirloom に寄せる | - |
| `ISSUE-084` | `#190` | `done` | P1 | M | /privacy を Quiet Heirloom trust surface に再設計する | - |
| `ISSUE-085` | `#191` | `done` | P1 | M | /lp を keepsake journey と public trust bridge へ寄せる | - |
| `ISSUE-086` | `#192` | `done` | P1 | M | Public LP / Privacy visual QA gate を拡張する | ISSUE-084, ISSUE-085 |
| `ISSUE-087` | `#194` | `done` | P1 | M | Home のアルバム棚を最新ページ込みの横スクロールに整える | - |
| `ISSUE-088` | `#199` | `done` | P2 | S | post-merge issue status drift を同期する | - |
| `ISSUE-089` | `#202` | `done` | P1 | S | 待機リスト登録後の連絡期待値を明確にする | - |
| `ISSUE-090` | `#204` | `done` | P2 | S | ISSUE-089 完了後の状態同期 | - |
| `ISSUE-091` | `#206` | `done` | P0 | S | 待機リスト公開前 readiness gate を追加する | - |
| `ISSUE-092` | `#208` | `done` | P1 | S | ISSUE-091 完了後の状態同期 | ISSUE-091 |
| `ISSUE-093` | `#210` | `done` | P1 | S | LP の親 relevance と trust 詳細導線を強化する | - |
| `ISSUE-094` | `#212` | `done` | P1 | S | ISSUE-093 完了後の状態同期 | ISSUE-093 |
| `ISSUE-095` | `#214` | `done` | P1 | S | LP の表記ゆれと artifact 文言を整える | - |
| `ISSUE-096` | `#216` | `done` | P1 | S | ISSUE-095 完了後の状態同期 | - |
| `ISSUE-097` | `#218` | `done` | P1 | S | LP 評価表の relevance と trust 完了状態を同期する | - |
| `ISSUE-098` | `#220` | `done` | P1 | S | ISSUE-097 完了後の状態同期 | - |
| `ISSUE-099` | `#222` | `done` | P1 | S | LP 公開用 keepsake 画像 asset を追加する | - |
| `ISSUE-100` | `#224` | `done` | P1 | S | ISSUE-099 完了後の状態同期 | - |
| `ISSUE-101` | `#226` | `done` | P2 | S | LP の紙片と card 境界を Quiet Heirloom に寄せる | - |
| `ISSUE-102` | `#228` | `done` | P1 | S | ISSUE-101 完了後の状態同期 | - |
| `ISSUE-103` | `#230` | `done` | P0 | S | 公開前 traffic の Go/Hold attestation を追加する | - |
| `ISSUE-104` | `#232` | `done` | P1 | S | ISSUE-103 完了後の状態同期 | - |
| `ISSUE-105` | `#234` | `blocked` | P0 | S | staging preflight を実行し公開前 traffic の Go/Hold を判定する | - |
| `ISSUE-106` | `#236` | `done` | P0 | S | staging target の read-only contract を追加する | - |
| `ISSUE-107` | `#238` | `done` | P0 | S | staging migration status を redacted に確認する | - |
| `ISSUE-108` | `#239` | `done` | P0 | S | proxy client IP と rate limit 境界を強化する | - |
| `ISSUE-109` | `#237` | `done` | P0 | S | privacy mailbox 運用 attestation を追加する | - |
| `ISSUE-110` | `#240` | `done` | P0 | M | staging public QA の strict runtime mode を追加する | - |
| `ISSUE-111` | `#246` | `done` | P0 | M | 個人情報を含めない記録ファネル計測を追加する | - |
| `ISSUE-112` | `#247` | `done` | P0 | M | 記録フッターの主要ボタンを進行状態に同期する | ISSUE-111 |
| `ISSUE-113` | `#248` | `done` | P0 | S | AI下書き前の親のひとことを独立入力にする | ISSUE-112 |
| `ISSUE-114` | `#249` | `done` | P0 | M | 写真アップロードを段階別に再試行できるようにする | ISSUE-113 |
| `ISSUE-115` | `#250` | `done` | P0 | S | AI生成に待機上限と回復導線を追加する | ISSUE-114 |
| `ISSUE-116` | `#251` | `done` | P0 | M | 記録下書きのタブ内保全と保存API冪等化を実装する | ISSUE-115 |
| `ISSUE-117` | `#252` | `done` | P0 | M | AI生成文の安全性検証と限定自動再生成を追加する | - |
| `ISSUE-118` | `#253` | `done` | P0 | M | AI利用同意を設定画面から撤回できるようにする | - |
| `ISSUE-119` | `#254` | `done` | P0 | M | 必須入力とエラー復帰をアクセシブルにする | ISSUE-116 |
| `ISSUE-120` | `#255` | `done` | P0 | M | 月別ふりかえりの最小体験を実装する | - |
| `ISSUE-121` | `#264` | `done` | P1 | S | ホームとアルバムの役割を整理し、最新ページの重複表示を減らす | - |
| `ISSUE-122` | `#268` | `done` | P0 | S | OAuth callback の外部リダイレクトを遮断する | - |
| `ISSUE-123` | `#269` | `done` | P0 | M | 削除済み記録の画像アクセスとAI再送信を遮断する | - |
| `ISSUE-124` | `#270` | `done` | P0 | M | アップロード確定時にStorage実体と画像内容を検証する | - |
| `ISSUE-125` | `#271` | `done` | P1 | S | Storageエラーログを固定reason allowlistへ統一する | - |
| `ISSUE-126` | `#272` | `done` | P0 | M | 保存済み記録のタイトル・本文・天気を編集できるようにする | - |
| `ISSUE-127` | `#273` | `done` | P1 | M | 設定から子どもの呼び名と誕生日を編集できるようにする | - |
| `ISSUE-128` | `#274` | `done` | P1 | M | 404・予期しないエラーを温かい復帰画面にする | - |
| `ISSUE-129` | `#275` | `done` | P1 | S | 認証後画面にプライバシー安全なページタイトルを付ける | - |
| `ISSUE-130` | `#276` | `done` | P1 | S | 30秒記録の3ステップを意味のある進行表示にする | - |
| `ISSUE-131` | `#277` | `done` | P1 | M | Route HandlerレスポンスをOpenAPIスキーマで検証するCIゲートを追加する | - |
| `ISSUE-132` | `#278` | `done` | P1 | S | サインアウト失敗を検知しセッション残存を誤表示しない | - |
| `ISSUE-133` | `#282` | `done` | P1 | S | 記録APIの他者所有と不存在を404へ統一する | - |
| `ISSUE-134` | `#283` | `done` | P1 | M | 記録更新に楽観的排他を導入する | - |
| `ISSUE-135` | `#294` | `done` | P0 | L | 退会受付で全セッションとデータアクセスを即時停止する | - |
| `ISSUE-136` | `#295` | `done` | P0 | M | 退会30日後にDB・Storage・Authを物理削除する | - |
| `ISSUE-137` | `#296` | `done` | P0 | M | confirm時に原画像を再エンコードしてEXIFを除去する | - |
| `ISSUE-138` | `#297` | `done` | P0 | M | AI同意撤回後の外部送信を競合なく遮断する | ISSUE-118 |
| `ISSUE-139` | `#298` | `done` | P0 | M | AI外部通信をDBトランザクションから分離する | ISSUE-138 |
| `ISSUE-140` | `#299` | `done` | P1 | M | 認証済みgolden pathを実ブラウザCIで検証する | - |
| `ISSUE-141` | `#300` | `done` | P1 | M | 未confirm画像を期限後に安全に清掃する | - |
| `ISSUE-142` | `#301` | `done` | P1 | M | 欠損画像variantを自動修復する | - |
| `ISSUE-143` | `#302` | `done` | P1 | M | 記録作成で写真を最大5枚扱えるようにする | - |
| `ISSUE-144` | `#303` | `done` | P1 | S | 記録編集中の誤離脱で入力を失わないようにする | - |
| `ISSUE-146` | `#312` | `done` | P1 | S | 復元写真のstateとrefを同期して即時保存競合を防ぐ | ISSUE-143 |
| `ISSUE-147` | `#315` | `done` | P0 | S | AI生成の旧版互換triggerを削除する | ISSUE-139 |
| `ISSUE-148` | `#318` | `done` | P0 | S | 未構成環境のmaintenance scheduleを明示的にHOLDする | - |
| `ISSUE-149` | `#319` | `done` | P1 | M | Issue台帳とGitHub状態のdriftをCIで防ぐ | - |
| `ISSUE-150` | `#320` | `done` | P1 | M | 認証方式と全Route応答契約をOpenAPIへ一致させる | - |
| `ISSUE-151` | `#321` | `todo` | P1 | M | DB least-privilegeとRLSのtracer bulletを実装する | - |
| `ISSUE-152` | `#322` | `todo` | P1 | M | PII-safe telemetry集約基盤を作る | - |
| `ISSUE-153` | `#329` | `blocked` | P0 | M | SLO・alert・synthetic canaryを定義する | ISSUE-105, ISSUE-152 |
| `ISSUE-154` | `#330` | `blocked` | P0 | M | DB・Storage・Authの復旧契約と合成restore drillを作る | ISSUE-105 |
| `ISSUE-155` | `#323` | `todo` | P0 | M | confirmed cleanupへlease・backoff・dead-letterを追加する | - |
| `ISSUE-156` | `#324` | `todo` | P1 | M | Critical pathのcoverage・mutation gateを導入する | - |
| `ISSUE-157` | `#325` | `todo` | P1 | M | 現行アプリのVisual・A11y・mobile・cross-browser baselineを作る | - |
| `ISSUE-158` | `#326` | `todo` | P1 | M | route JS・CWV・画像処理のperformance budgetをCIへ追加する | - |
| `ISSUE-159` | `#327` | `review` | P1 | M | PRD契約とfunnelのGo・Hold基準を再同期する | - |
| `ISSUE-160` | `#331` | `blocked` | P0 | M | 5名pilotで30秒記録とAI下書き受容性を検証する | ISSUE-105, ISSUE-152, ISSUE-159, ISSUE-161, ISSUE-185 |
| `ISSUE-161` | `#328` | `blocked` | P0 | S | AI vendorのdata-handling attestationを確定する | - |
| `ISSUE-162` | `#332` | `blocked` | P0 | M | Release evidence dossierと最終Go・No-Goを確定する | ISSUE-105, ISSUE-148, ISSUE-149, ISSUE-150, ISSUE-151, ISSUE-152, ISSUE-153, ISSUE-154, ISSUE-155, ISSUE-156, ISSUE-157, ISSUE-158, ISSUE-159, ISSUE-160, ISSUE-161, ISSUE-185 |
| `ISSUE-163` | `#335` | `review` | P1 | S | Loop Engineerの自動マージ方針と危険操作境界を定義する | - |
| `ISSUE-164` | `#336` | `review` | P1 | M | PRの自動マージ適格性を機械判定する | - |
| `ISSUE-165` | `#337` | `review` | P0 | M | 複数専門サブエージェントの独立review gateを実装する | - |
| `ISSUE-166` | `#338` | `in_progress` | P0 | M | GitHub Rulesetと安全なAuto-mergeを有効化する | - |
| `ISSUE-168` | `#346` | `review` | P0 | M | GitHub App preflightを通常gh認証から分離する | - |
| `ISSUE-169` | `#348` | `review` | P0 | S | App preflightのpnpm参照先をtrusted checkoutへ固定する | - |
| `ISSUE-171` | `#352` | `review` | P0 | S | Gate evaluationをJSON-onlyで後段へ渡す | - |
| `ISSUE-173` | `#356` | `review` | P0 | M | レビュー上限の人間承認例外をSHAへ束縛する | - |
| `ISSUE-185` | `#375` | `blocked` | P0 | M | ProductEventの退会purgeとHMAC key lifecycleを実装する | ISSUE-152 |

## Status Rules

- `todo`: 受け入れ条件があり、未着手
- `in_progress`: 現在のbranchで作業中
- `review`: 実装・検証済みで、PR reviewまたは人間確認待ち
- `done`: merge済み、またはIssueの目的が完了済み
- `blocked`: 人間判断、外部依存、credential、設計未決定で停止

1 Issue 1 PRを守ります。merge済みIssueの状態同期だけを目的にしたmaintenance Issueは、そのPR内でdoneへ更新できます。
