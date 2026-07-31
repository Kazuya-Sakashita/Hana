---
id: ISSUE-143
title: 記録作成で写真を最大5枚扱えるようにする
priority: P1
status: review
size: M
created_at: 2026-08-01
github_issue: 302
release_gate: product_accessibility_privacy
requires_human_review:
  - product
  - accessibility
  - privacy
---

# ISSUE-143: 記録作成で写真を最大5枚扱えるようにする

## 目的 (Why)

記録作成で1〜5枚の写真を順序付きで扱い、連続した瞬間を一つの記録として安全に残せるようにする。

## スコープ (What)

- 写真を合計5枚まで選択し、順序変更、個別削除、画像ごとのupload状態と再試行を提供する
- AI生成と記録保存へ、確認済み画像IDを画面上の順序どおり渡す
- 下書きは確認済み画像IDだけを順序付きで保存し、旧単一画像下書きを安全に移行する
- 確認後に記録へ紐付かなかった画像を、明示削除と期限後cleanupで回収する
- 画像の削除、AI生成、記録保存を同じ画像ロックで直列化する

## やらないこと (Out of Scope)

- 動画upload
- 6枚を超える記録
- drag and dropだけに依存する並べ替え
- 公開画像URLや画像本体を下書きへ保存すること

## 影響範囲

- `docs/openapi/openapi.yaml` と生成API型
- 記録作成画面、画像upload状態、下書き保存、AI生成要求
- 未紐付け画像の所有者限定削除APIと期限後cleanup
- 記録保存・AI生成の画像検証と競合制御
- unit / integration / DOM / 実PostgreSQL競合テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] 1〜5枚を選択し、順序変更と個別削除ができる
- [x] 6枚目は責めない文言で拒否し、先に選んだ写真と入力を保持する
- [x] 各画像の準備、送信、確認、失敗、再試行を識別できる
- [x] 一部失敗時も選択済み写真と入力を保持し、失敗画像だけを再試行できる
- [x] 全画像の確認完了前はAI生成と保存を行わず、失敗画像を黙って除外しない
- [x] 主写真と順序がAI入力、保存、詳細画面へ一貫して反映される
- [x] キーボードと支援技術で枚数、順序、状態、上へ、下へ、削除を確認・操作できる
- [x] 下書きには順序付きの確認済み画像IDだけを保存し、写真、File、blob/object URL、signed URL、storage key、ファイル名を保存しない
- [x] 写真変更中の古いupload/AI応答を採用せず、object URLを不要になった全経路で解放する
- [x] 明示削除と48時間超の未紐付け画像cleanupは、所有者・未紐付け・未削除をロック内で再確認する
- [x] 削除、AI生成、保存の競合で保存済み画像を削除せず、部分保存を発生させない
- [x] AI送信前に所有者、未削除、未紐付け、metadata sanitization完了、入力順を再確認する
- [x] 画像本体、URL、storage key、ファイル名、base64、promptをログ、Problem Details、metricsへ含めない

## セキュリティ・プライバシー考慮

- ブラウザ永続化はUUIDのallowlistだけとし、復元値を信頼せずサーバ側で再検証する
- 画像ごとの一時upload情報はメモリ内だけに保持する
- 未紐付け画像のcleanup猶予は下書きTTL 24時間より長い48時間とする
- cleanupと保存は画像単位のadvisory lockで直列化し、実ユーザーの写真をQAに使わない
- エラーと計測は固定reasonと件数だけを記録する

## Human gate

- Product: 5枚上限、6枚目の文言、失敗時の保持、主写真の理解しやすさを確認する
- Accessibility: キーボードだけで順序変更・削除でき、読み上げで枚数・位置・状態を確認する
- Privacy: 下書き、ログ、cleanup対象と48時間猶予が画像データを漏らさないことを確認する

### Product確認

- 2026-08-01: 5枚上限、6枚目の説明、入力保持、1枚目の表紙表示を人間が確認し、問題なし

## 自動検証・専門レビュー

- `pnpm pr:gate`: PASS（140 files / 1099 tests、lint、typecheck、buildを含む）
- `pnpm openapi:lint`: PASS（既存warningのみ）
- 合成データ限定のローカルPostgreSQL競合QA: 7 scenarios PASS
- Standards / Spec / Product-Accessibility / Reliability / Security-Privacy-OpenAPI: GO
- Human gateはDraft PR上で、実ユーザー写真を使わず1項目ずつ実施する

## 参考

- GitHub #302
- PRD: 写真選択 1〜5枚、AI入力 写真 1〜5枚、MVP 最大5枚/記録
- ISSUE-114 / ISSUE-116 / ISSUE-124
