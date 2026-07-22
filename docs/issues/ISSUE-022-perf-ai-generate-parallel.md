---
id: ISSUE-022
title: AI generate の画像 DL + sharp resize を並列化
priority: P2
status: done
size: S
created_at: 2026-05-26
parent: PERF
github_issue: 75
---

## 目的 (Why)

`POST /v1/ai/generate` は複数画像対応のため `for (const img of images)` で **1 枚ずつ Storage download → sharp resize** を直列実行している。
1 枚あたり DL 300ms + resize 200ms = ~500ms。
将来複数画像 (家族共有・連続写真の物語化) を入れる時に詰む。

MVP 段階で 1 枚運用なので影響は小さいが、 **設計負債を作らない** ために今のうちに直す。

---

## スコープ (What)

### 修正

- [ ] `src/app/v1/ai/generate/route.ts` の image 処理ループを `Promise.all(images.map(async (img) => ...))` に置換
- [ ] 失敗時の挙動を明確化:
  - 1 枚でも DL 失敗 → 全体 fail (現状動作維持)
  - resize 失敗も同様
- [ ] sharp 並列実行の **メモリピーク** を制限したい場合は p-limit で max 3 並列 (5 枚以上を想定する場合のみ)

### やらないこと

- AI prompt の最適化 (Claude API 側、別 Issue)
- 画像の事前 resize (アップロード時にサーバ側で実施するなど) → ISSUE-019 系で検討

---

## 設計判断

### 並列度の制限を入れない理由

MVP では 1〜5 枚想定。 5 枚 × ~10MB の sharp buffer = ~50MB ピーク。 Vercel Function memory 1024MB 以下なら問題なし。
仮に将来 10 枚超を許可するなら `p-limit` 導入。

### エラーハンドリング: 1 枚失敗 = 全体失敗

「3 枚中 2 枚 OK で部分結果」 を返すと AI の物語が一貫しない。
全か無かのほうが UX として安全。

---

## 影響範囲

| 領域         | 影響                                          |
| ------------ | --------------------------------------------- |
| OpenAPI      | なし                                          |
| 生成型       | なし                                          |
| データ       | なし                                          |
| 画面         | なし (透過的)                                 |
| API          | `/v1/ai/generate` の内部実装                  |
| テスト       | 既存 AI generation テストパス + 並列化 verify |
| CI           | typecheck / lint / format / build / test      |
| ドキュメント | このIssueファイル                             |
| 環境変数     | なし                                          |

---

## 受け入れ条件

- [x] `pnpm typecheck` / `lint` / `format:check` / `build` / `test` グリーン
- [x] 1 枚時のレスポンスタイムが変わらない (regression なし)
- [x] 5 枚モックで合計時間が 1 枚時 +少しになる (= 並列化が効いている)
- [x] 1 枚失敗時に全体が 5xx (現状動作維持) を確認

### 確認結果

- `pnpm test tests/integration/v1/ai-generate.test.ts` → 11 tests passed
- `pnpm pr:gate` → format / lint / openapi route-map / typecheck / test 271 件 / build:ci passed

---

## 動作確認手順

```bash
pnpm dev
# 1. /record で 1 枚アップロード → AI 生成 → 既存と同じ時間内に完了
# 2. (テストフィクスチャで) 複数画像配列を渡して並列化後の合計時間を測定
# 3. 意図的に 1 枚の storage_key を不正にして 5xx を返すこと
```

---

## リスク

- sharp の並列実行で memory 不足 → 5 枚超を想定する時のみ p-limit
- DB connection pool 圧迫 → DL は Storage、 DB lookup は事前 1 回なので影響なし

---

## 参考

- ISSUE-010 (AI generation)
- `src/features/ai/server/resize.ts` (sharp 設定)
