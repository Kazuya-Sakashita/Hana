---
id: ISSUE-111
title: 個人情報を含めない記録ファネル計測を追加する
priority: P0
status: done
size: M
created_at: 2026-07-28
github_issue: 246
---

## 目的 (Why)

写真選択から保存までの詰まりを、本文や画像情報を取得せずに検証できるようにする。
登録から初回記録完了率は、イベント件数ではなく既存のProfileとMemoryを母集団にして算出する。

## スコープ (What)

- 認証必須のプロダクトイベントAPI
- 許可リスト化したイベント名と4フィールドだけのpayload
- user_idをサーバー側HMACへ変換した仮名actor
- event_idによる冪等保存
- 同一flow・同一段階の重複排除
- 1分60件のレート制限と90日の保持期限
- `/record`の開始、写真選択、AI下書き表示、保存完了イベント
- 記録詳細の閲覧イベント

## やらないこと (Out of Scope)

- 外部Analyticsサービス
- BIダッシュボード
- 自由形式イベント
- 個人単位の行動履歴表示

## 指標の定義

- 写真選択→保存完了率: `photo_selected`があるdistinct `flow_id`を分母、同じflowの
  `memory_saved`を分子とする。同一段階の再操作は1件として扱う。
- 所要時間: `memory_saved.elapsed_bucket`の分布を使う。取得できたイベントだけを母集団とし、
  通信失敗による欠測可能性があることを集計結果に明記する。
- 登録→初回記録完了率: UTC日単位の`Profile.createdAt`コホートを分母にする。観測期間を
  24時間確保できたProfileだけを対象とし、`Profile.createdAt`から24時間以内に
  `deletedAt IS NULL`のMemoryが1件以上作られたProfileを分子にする。日時基準は
  `Memory.createdAt`であり、保護者が指定する`recordedAt`は使わない。

## 影響範囲

- OpenAPIと生成型
- Prisma schemaとmigration
- metrics Route Handler
- 記録・記録詳細のbest-effortイベント送信
- Privacy / Securityテスト

## 受け入れ条件 (Acceptance Criteria)

- [x] OpenAPIと生成型が一致する
- [x] 未知フィールドをProblem Detailsで拒否する
- [x] event_id再送で二重計上しない
- [x] 記録フローの開始・完了・粗い所要時間帯を集計できる
- [x] 本文、画像情報、氏名、生年月日、メール、URL、storage_keyを保存しない
- [x] クライアントからactorを指定できない

## セキュリティ・プライバシー考慮

actorは認証済みuser_idからHMAC-SHA256で生成する。productionでは
32文字以上の`PRODUCT_EVENT_HASH_PEPPER`を必須とし、request bodyやactorの生値をログへ出力しない。
イベント取込時の削除に加え、Supabase Cronで毎日90日より古い行を削除する。これは匿名化ではなく
仮名化であり、個人データとしてアクセス制御・保持・削除の対象にする。Cronが有効でない環境は
公開前trafficの判定をHOLDにする。

クライアント送信は記録操作を阻害しないbest-effortとする。通信失敗による欠測の可能性を
集計上の制約として扱い、登録ユーザー数や初回記録完了率の母集団には使用しない。

## 参考

- GitHub #246
- `Hana_PRD_v1.md` §14
