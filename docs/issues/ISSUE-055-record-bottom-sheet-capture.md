---
id: ISSUE-055
title: 記録画面の下部シート型 30 秒フロー刷新
priority: P0
status: todo
size: M
created_at: 2026-07-23
parent: DESIGN-REBUILD
github_issue: 112
blocked_by:
  - ISSUE-054
  - ISSUE-058
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

Hana MVP の中核である「写真 1 枚から 30 秒で記録完了」を、視覚的にも操作的にも成立させる。
現行 `/record` は機能が一画面に並び、写真、アップロード、AI、編集、日付、天気、保存の
認知負荷が高い。下部シート中心の段階的な flow に再構成する。

## スコープ (What)

- `/record` を Bottom-Sheet Capture の情報設計へ変更する
- 写真選択、AI 下書き、本文確認、保存完了までの primary action を下部に固定する
- AI 生成本文は中核価値として確認対象にし、本文の手動編集、日付、天気は fold / secondary に下げる
- AI 同意 dialog と AI skip / retry / edit の導線を維持する
- upload / AI / save failure から自然に戻れる状態を整える
- keyboard open、visual viewport、safe-area、focus order、input occlusion を確認する

## やらないこと (Out of Scope)

- API / DB / Storage / AI payload の変更
- AI prompt の変更
- 画像アップロード方式の変更
- album / detail の visual redesign

## 影響範囲

| 領域         | 影響                                      |
| ------------ | ----------------------------------------- |
| OpenAPI      | なし                                      |
| 生成型       | なし                                      |
| アプリコード | `src/app/record/page.tsx`、必要な小 UI    |
| テスト       | record flow、dialog、状態別表示の確認     |
| ドキュメント | Issue 正本、manual QA、design review note |

## 受け入れ条件 (Acceptance Criteria)

- [ ] 写真選択から保存までの primary CTA が mobile thumb zone にある
- [ ] AI は opt-in を維持し、同意を隠さない
- [ ] AI consent copy が `docs/design/ai-consent-privacy-evidence.md` の送信データ説明と矛盾しない
- [ ] AI 生成本文は中核価値として表示し、手動編集だけを optional / secondary として扱っている
- [ ] AI を使わない場合でも保存まで進める
- [ ] upload / AI / save failure 後に入力を失わず戻れる
- [ ] core AI path / AI skip path / first consent path の 30 秒計測条件と結果が PR に残っている
- [ ] keyboard open 時も primary CTA、入力欄、focus が破綻しない
- [ ] body text 7:1 目標、helper / small text 4.5:1、44px tap target、visible focus、reduced motion を維持する
- [ ] Evidence に PII / image URL / storage_key / prompt / AI 生成本文がない
- [ ] `git diff --check` と relevant tests が通る

## レビュー方針

専門サブエージェント 3 名で UX / Privacy / Visual-A11y-Engineering の read-only review を行い、
最大 3 回まで修正と再レビューを回す。

## セキュリティ・プライバシー考慮

- AI 同意、写真アップロード、保存の trust surface を弱めない
- 画面証跡には synthetic data のみを使う

## 参考

- `docs/design/quiet-heirloom-design-canon.md`
- `src/app/record/page.tsx`
