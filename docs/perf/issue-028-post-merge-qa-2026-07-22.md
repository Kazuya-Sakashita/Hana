# ISSUE-028 マージ後 QA (2026-07-22)

## 対象

- GitHub Issue: #43
- 実装 PR: #44
- 確認対象 commit: `a14c086` (QA 開始時点の `origin/main`)
- QA branch: `codex/issue-043-post-merge-qa`
- worktree: `/private/tmp/hana-issue43-post-merge-qa`

この QA は、作業中の feature worktree に触れず、merge 済みの ISSUE-028
`next/image` 実装を確認するための記録である。

## 結果

| 確認項目                                                                       | 結果               | 根拠                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `next.config.ts` が private signed URL を Vercel Image Optimization に通さない | 合格               | `images.unoptimized: true` と Supabase `remotePatterns` がある                                                            |
| 主要な signed URL 画像表示が `next/image` を使っている                         | 合格               | `/`, `/album`, `/memory/[memoryId]` が `Image` を import / render している                                                |
| `src/app` / `src/components` に従来の `<img>` が残っていない                   | 合格               | `rg -n "<img" src/app src/components` が該当なし                                                                          |
| `/album` が thumbnail signed URL を使う                                        | 合格 (code / test) | `fetchMemoriesWithCovers` が `generateSignedImageUrl(..., 'thumbnail')` を呼び、 integration test が `_thumb.webp` を期待 |
| `/memory/[memoryId]` が preview signed URL を使う                              | 合格 (code / test) | `fetchMemoryWithPreviews` が `generateSignedImageUrl(..., 'preview')` を呼び、 integration test が `_preview.webp` を期待 |
| memory detail の 1 枚目画像が priority 指定されている                          | 合格 (code)        | detail の `Image` に `priority={idx === 0}` がある                                                                        |
| project 全体の gate                                                            | 合格               | `pnpm pr:gate`: format / lint / route-map / typecheck / 271 tests / build が成功                                          |
| variant 関連 integration tests                                                 | 合格               | `uploads-url`, `memories`, `uploads`: 46 tests が成功                                                                     |

## 実行コマンド

```bash
pnpm install
pnpm pr:gate
pnpm test tests/integration/v1/uploads-url.test.ts tests/integration/v1/memories.test.ts tests/integration/v1/uploads.test.ts
rg -n "<img" src/app src/components
rg -n "from 'next/image'|<Image|<NextImage|priority=|sizes=|unoptimized" next.config.ts src/app src/components
rg -n "deriveVariantKey|generateSignedImageUrl\\(|'thumbnail'|'preview'|_thumb|_preview" src/features src/app/v1 tests/integration/v1
```

## 認証済みブラウザ QA がまだ必要な項目

以下の受け入れ条件は、実際の memory / image データが入った認証済み環境で確認する必要がある。
静的確認だけでは完了扱いにしない。

- DevTools Network で `/album` の画像 request が `*_thumb.webp` signed URL であることを確認する
- DevTools Network で `/memory/{id}` の画像 request が `*_preview.webp` signed URL であることを確認する
- `/album` の viewport 外画像が初期ロードに含まれないことを確認する
- Lighthouse mobile で "Properly size images" が悪化していないことを確認する
- `/memory/{id}` の LCP を 2026-05-27 baseline と比較して再計測する

## 推奨

上記の認証済みブラウザ QA が記録されるまでは、GitHub Issue #43 は open のままにする。
実データまたは staging 環境が用意できない場合は、その制約を明記したうえで小さな follow-up
Issue に分離し、#43 は「実装と静的確認まで完了」として扱う。
