---
id: ISSUE-124
title: アップロード確定時にStorage実体と画像内容を検証する
priority: P0
status: done
size: M
created_at: 2026-07-30
github_issue: 270
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - security
  - privacy
  - backend
---

# ISSUE-124: アップロード確定時にStorage実体と画像内容を検証する

## 目的 (Why)

クライアント申告値ではなく、private Storageに保存された実体を検証してからImageを確定し、欠落・破損・形式偽装・上限超過をDBへ保存しない。

## スコープ (What)

- `/v1/uploads/confirm`でStorage実体を取得する
- magic bytesとStorage MIME、保存先拡張子の一致を検証する
- HEIC/AVIF偽装を拒否し、HEICの直接signed uploadを一時停止する
- 動画・animated画像を拒否する
- 画像を完全decodeし、破損画像を拒否する
- 向き補正後のwidth / heightと実byte数を保存する
- 10MiB、10000px、総画素25MPの上限を実体値で検証する
- Storageを10秒期限・10MiB上限付きstreamで取得し、一時障害と欠落を分離する
- 検証済みbufferをvariant生成へ再利用する
- 冪等再送と同時確定の収束を維持する

## やらないこと (Out of Scope)

- 画像変換形式の変更
- Storage providerの変更
- 10MiB上限の見直し
- 既存Imageの再検証・backfill

## 影響範囲

- `POST /v1/uploads/confirm`
- `UploadConfirmRequest` OpenAPI schema
- upload server verification / variant pipeline
- uploads integration / unit tests

## 受け入れ条件 (Acceptance Criteria)

- [x] Storageに対象がない場合はImageを作成せずProblemDetailsを返す
- [x] 破損画像、MIME不一致、上限超過を安定reasonで拒否する
- [x] HEIC/AVIF偽装とanimated画像を安定reasonで拒否する
- [x] width、height、file_sizeを実体から算出して保存する
- [x] 冪等再送と同時確定の既存挙動を維持する
- [x] Storageと画像解析をmockした統合テストがある
- [x] 実画像、URL、storage_keyをログや証跡へ残さない

## セキュリティ・プライバシー考慮

- 外部Storageと画像decoderのerror messageはログ・ProblemDetailsへ転記しない
- 画像buffer、保存先識別子、レスポンスURLをログへ出さない
- 画像形式は拡張子、Storage MIME、magic bytesの3点で一致させる
- 画像decodeと上限判定をDB作成より前に完了する
- テストは実写真ではなく生成した単色画像bufferだけを使う

## 検証

- [x] OpenAPI lint / bundle / generated types
- [x] uploads focused tests
- [x] Security / Privacy / Backend専門レビュー
- [x] `git diff --check`
- [x] `pnpm pr:gate`

## 専門レビュー記録

### Round 1

- Security / Privacy: 100MP多重decode、download後のサイズ判定、AVIFのHEIC偽装、Storage障害の404化を指摘
- Backend / Image Processing: HEIC decoder環境差、animated WebP、旧hintとOpenAPIの不一致を指摘
- Reliability / Test Architecture: Storage障害分類、verifier境界、OpenAPI例を指摘
- 対応:
  - 25MP総画素上限、variant直列化、10秒Abort、10MiB上限付きstreamを導入
  - Storage 404と503を固定ProblemDetailsへ分離
  - animated WebPとAVIF偽装を拒否
  - 旧hintは存在時だけOpenAPIどおり検証し、確定値には使用しない
  - HEIC元ファイルはUIでJPEGへ再エンコードし、direct HEIC signed uploadを一時停止
  - ADR-0014を追加
- 判定: REQUEST_CHANGES

### Round 2

- Security / Privacy: infoで10MiB超を確認後もdownloadする点、極端な寸法reasonを指摘
- Backend / Image Processing: APNGの`acTL`迂回、未cancel stream、bundled OpenAPIの陳腐化を指摘
- Reliability / Test Architecture: 実同時confirm、download/stream/Abortのfailure matrix不足を指摘
- 対応:
  - metadata超過をdownload前に拒否し、stream側でもdefensive cancel
  - PNG chunk境界を解析してAPNGを拒否
  - Sharp pixel-limitを`image_dimensions_too_large`へ正規化
  - bundled OpenAPIを再生成
  - 同一`storage_key`の準備処理をprocess内single-flight化
  - 2本同時confirm、cross-instance P2002、download 404/503/throw、stream failure、AbortSignal、variant順序テストを追加
- 判定: REQUEST_CHANGES

### Round 3

- Security / Privacy: APPROVE
- Backend / Image Processing: APPROVE
- Reliability / Test Architecture: APPROVE
- 再検証:
  - focused tests: 5ファイル / 78件成功
  - 全体tests: 117ファイル / 945件成功
  - OpenAPI lint / bundle / generated types成功
  - `pnpm pr:gate`、production build、`git diff --check`成功
  - `oasdiff`: direct HEIC request enum削除の意図した破壊変更1件。ADR-0014に判断と復帰条件を記録
- 残存リスク:
  - single-flightはprocess内限定。別instance間はP2002でDB収束するが画像処理は重複し得る
  - 実Supabaseのmetadata / Abort / error shapeはstaging smokeで最終確認する
- 判定: APPROVE
