---
id: ISSUE-029
title: 「のこす」「お気に入り」「削除」を optimistic UI に
priority: P2
status: done
size: M
created_at: 2026-05-26
parent: PERF
github_issue: 77
---

## 目的 (Why)

実 latency を下げきった後の **次の体感速度改善**。

- 「のこす」 押下 → 1.5 秒固まる → 成功画面
- お気に入りトグル → fetch 完了まで指の下がモヤモヤ
- 削除 → 確認 → 待つ → リストから消える

楽観的に **押した瞬間に UI を更新** し、 失敗時に rollback + toast で謝るパターンに。

---

## スコープ (What)

### 前提

- ISSUE-023 (Tanstack Query) 完了済

### 修正

- [x] **「のこす」 ボタン**:
  - 押下と同時に `/album` へ遷移、 `queryClient.setQueryData` で楽観追加
  - server 失敗時は `/record` に戻し、 toast で「ほぞんに しっぱい しました。 もういちど」
- [x] **お気に入りトグル** (`/memory/{id}` と `/album` のリスト):
  - 押下と同時に icon を切替
  - server 失敗時は icon を戻し、 toast
- [x] **削除** (`/memory/{id}`):
  - 確認ダイアログ「とじる」 で `/album` に遷移しつつリストから消す
  - server 失敗時は復活させて toast

### 新規

- [x] `src/components/ui/toast.tsx` (シンプルな toast)
  - Sonner や Radix Toast 等のライブラリ採用も可
  - V0 §1「Whisper not shout」 に沿い、 控えめなデザイン
- [x] `src/lib/perf/optimistic.ts` ヘルパ (queryClient.setQueryData + rollback パターン)

### やらないこと

- undo (将来)
- offline 対応 (将来)
- 楽観 mutation の queue (失敗連鎖防止) → 将来

---

## 設計判断

### 失敗時のリカバリーは「謝って rollback」、 自動 retry はしない

Tanstack Query の自動 retry は **mutation には適用しない** (副作用ありなので)。
toast で謝り、 ユーザーに再操作してもらう (V0 §1 「Forgive the user」 と整合)。

### toast のデザイン

- 「ほぞんに しっぱい しました」 (やわらかい amber 色、 控えめ)
- 5 秒で自動消失
- 重ねず、 1 つだけ表示

### 「のこす」 だけ少し特別

「のこす」 失敗時に `/record` へ戻すのは **入力内容を保持** したいから。
楽観追加していた memory を rollback しつつ、 `/record` を再表示し、 form state を維持する仕組みが必要。

→ 安全側: `/record` への戻りでは form state は **localStorage に下書き保存** しておき、 mount 時に restore (今後の draft 機能の足場にもなる)。
→ ただし MVP では「失敗時は /record に戻ってフォーム空っぽ + toast」 でも OK。 PR レビュー時に決定。

---

## 影響範囲

| 領域         | 影響                                     |
| ------------ | ---------------------------------------- |
| OpenAPI      | なし                                     |
| 生成型       | なし                                     |
| データ       | なし                                     |
| 画面         | `/record`, `/album`, `/memory/[id]`      |
| API          | なし (mutation はそのまま)               |
| テスト       | optimistic + rollback の unit test       |
| CI           | typecheck / lint / format / build / test |
| ドキュメント | このIssueファイル                        |
| 環境変数     | なし                                     |

---

## 受け入れ条件

- [x] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [x] 「のこす」 押下から `/album` 遷移まで **< 100ms**
- [x] お気に入りトグルの反応が **< 50ms** (体感的に即時)
- [x] 削除後の `/album` 遷移が **< 100ms**
- [x] サーバ失敗時に toast が出て、 UI が rollback される
- [x] toast デザインが「whisper」 原則

### 確認結果

- `pnpm test tests/unit/lib/perf/optimistic.test.ts` → 8 tests passed
- `pnpm pr:gate` → format / lint / openapi route-map / typecheck / test 276 件 / build:ci passed
- Review 対応後: PR 対象ファイルの format / lint / openapi route-map / typecheck / test 279 件 / build:ci passed
- Review Round 2 対応後: PR 対象ファイルの format / lint / typecheck / test 279 件 / build:ci passed。`/record` validation 失敗時は field error メタデータのみ sessionStorage に一時退避して復元
- 即時反応条件は、click handler 内で network mutation を await する前に `router.push` / `queryClient.setQueryData` を実行する構造と rollback unit test で確認

---

## 動作確認手順

```bash
pnpm dev
# 1. /record で 1 件入力 → のこす → /album に即遷移、 リストに楽観追加
# 2. (devtools で API mock → 失敗) → toast 「ほぞんに しっぱい しました」、 楽観追加が消える
# 3. /album のお気に入りアイコン → 即座に変わる、 server 完了で確定
# 4. (mock 失敗) → アイコン戻る
# 5. /memory/{id} で削除 → リストから即消える
# 6. (mock 失敗) → 復活
```

---

## リスク

- 楽観 state と server state のズレが累積する → mutation 完了時に invalidate して整合
- toast スパムで UI 阻害 → 1 つだけ表示、 5 秒で消失
- 「のこす」 失敗で form state を失うと退避できなくなる → localStorage 下書き保存を併用

---

## 参考

- ISSUE-023 (Tanstack Query、 前提)
- V0 §1「Forgive the user」「Whisper not shout」
- Tanstack Query optimistic updates: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
