---
id: ISSUE-081
title: Album / Memory Detail private shelf polish を整える
priority: P1
status: done
size: M
created_at: 2026-07-25
parent: LP-APP-DESIGN-PARITY
github_issue: 181
blocked_by:
  - ISSUE-076
  - ISSUE-077
  - ISSUE-078
  - ISSUE-079
  - ISSUE-080
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

LP-App visual parity の次段として、Album / Memory Detail を public feed ではなく
「しまってある私的な棚」として磨く。

`ISSUE-070` までで大枠は整っているが、多件数一覧、しるし操作、保存直後 notice、
記録詳細の action band がまだ実用 UI として少し前に出る。写真と本文を主役にし、
操作は必要なときだけ静かに支える。

## スコープ (What)

- Album の棚見出しを private shelf として読みやすくする
- Album favorite を ranking ではなく「しるし」として quiet icon language に寄せる
- Memory Detail の保存直後 notice を、読み返しを妨げない控えめな状態表示にする
- Memory Detail の action band を写真と本文の後ろへ控えめに置く
- Delete confirm dialog を generic card から paper surface tone へ寄せる
- 静的 contract test と Issue index を更新する

## やらないこと (Out of Scope)

- 写真拡大ビューの実装
- 文章編集・シェア・月別ふりかえりの実装
- pagination API、delete API、favorite API の変更
- Auth / Storage / DB / OpenAPI の変更
- privacy / legal claim の追加

## 影響範囲

- `src/app/album/page.tsx`
- `src/features/memories/client/album-list.tsx`
- `src/app/memory/[memoryId]/page.tsx`
- `src/components/memory-actions.tsx`
- Album / Memory Detail private shelf 系の静的 contract test
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] Album の棚見出しと一覧が private shelf として読め、feed / ranking / SNS 風の語彙を増やさない
- [x] Album favorite は ranking ではなく「しるし」として、quiet icon language と 44px tap target を維持する
- [x] Memory Detail は写真と本文が action band より先に読める
- [x] 保存直後 notice は大きな success card ではなく、読み返しを妨げない控えめな状態表示になっている
- [x] Delete dialog は復元・完全削除・保持期間を約束しない
- [x] API / DB / Auth / Storage / OpenAPI / pagination / delete behavior を変更しない
- [x] Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 実装メモ

- Album の棚見出しに private shelf の説明と quiet `BookOpen` icon を追加した
- Album favorite を `QuietIconButton` へ寄せ、個人的な「しるし」として 44px tap target / `aria-pressed` / optimistic update を維持した
- Album shelf item に stable `data-testid` を追加し、多件数 layout / smoke contract を更新した
- Memory Detail の保存直後 notice を `PaperSlip` + `QuietIcon` へ寄せ、読み返しを妨げない小さな状態表示にした
- Memory Detail の action band を `QuietIconButton` 2 個の控えめな操作へ寄せ、説明文を `aria-describedby` で関連付けた
- Delete confirm dialog を generic `Card` から `StatePanel` へ寄せ、既存 `deleteMemoryDescription` による trust contract を維持した
- merge 済み `ISSUE-080` の local status と index を `done` へ同期した

## セキュリティ・プライバシー考慮

- UI polish と copy / tests の変更であり、API / DB / Auth / Storage / OpenAPI には触れない
- favorite / delete の optimistic update、rollback、unauthorized handling は維持する
- Delete confirm copy は既存 `deleteMemoryDescription` を使い、復元・完全削除・保持期間を約束しない
- PR body、Issue、test fixture に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 検証

- [x] `pnpm exec vitest tests/unit/app/album-memory-private-shelf-polish.test.ts tests/unit/app/album-memory-private-shelf-refinement.test.ts tests/unit/app/album-memory-keepsake.test.ts tests/unit/app/album-private-shelf-render-smoke.test.ts tests/unit/app/album-memory-private-shelf-layout-fixtures.test.ts tests/unit/app/bottom-nav-action-icon-alignment.test.ts tests/unit/app/signin-onboarding-settings-trust-bridge.test.ts --run`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                      | verdict | notes                                                                                          |
| ----- | ----------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 1     | Product UX / Private Shelf    | GO      | private shelf、secondary actions、saved notice の優先度は問題なし                              |
| 1     | Visual System / Accessibility | HOLD    | MemoryActions の icon-only label と custom button drift を指摘。`QuietIconButton` 化で修正済み |
| 1     | Privacy / Data Safety         | GO      | evidence leak、restore promise、API/Auth/Storage behavior drift なし                           |
| 2     | Visual System / Accessibility | GO      | stateful label、具体的 delete label、`aria-describedby`、`QuietIconButton` 再利用を確認        |

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/album-memory-keepsake-qa.md`
- `docs/issues/ISSUE-070-album-memory-private-shelf-refinement.md`
- `docs/issues/ISSUE-080-signin-onboarding-settings-trust-bridge.md`
