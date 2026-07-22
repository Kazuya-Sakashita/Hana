---
title: Bundle baseline
date: 2026-07-22
issue: ISSUE-021
branch: codex/issue-021-bundle-font
base: origin/main
---

# Bundle Baseline

ISSUE-021 で `@next/bundle-analyzer` を導入した時点の手動 bundle baseline。
今後、重い依存追加やフォント変更を行う PR では、このファイルを比較入口にする。

## Environment

| item    | value                             |
| ------- | --------------------------------- |
| command | `pnpm analyze`                    |
| app     | Next.js 16.2.6 / webpack analyzer |
| node    | v24.3.0                           |
| date    | 2026-07-22                        |
| output  | `.next/analyze/nodejs.html`       |
| output  | `.next/analyze/edge.html`         |
| output  | `.next/analyze/client.html`       |

## Font Inventory

`font-serif` の利用箇所を `rg` で棚卸しした結果、serif の強調は通常テキスト、`CardTitle` の `font-medium`、記録詳細タイトルの `font-medium`、一部の `font-normal` が中心。
`font-medium` の serif 表示箇所は残るが、font loader で Noto Serif JP の 500 weight を直接読み込む指定はない。読み込み weight は `400` と `700` に削減し、500相当の見え方は merge-before-release の Visual QA で許容確認する。

## Build Output Baseline

`pnpm analyze` の route output から記録する。
`@next/bundle-analyzer` は Turbopack build では report を生成しないため、`analyze` script は `build:ci` の環境変数を再利用しつつ `next build --webpack` を使う。

| route                              | rendering | notes                      |
| ---------------------------------- | --------- | -------------------------- |
| `/`                                | dynamic   | home with server data      |
| `/album`                           | dynamic   | album list                 |
| `/memory/[memoryId]`               | dynamic   | memory detail              |
| `/record`                          | static    | client record flow shell   |
| `/settings`                        | static    | client settings shell      |
| `/v1/*`                            | dynamic   | API Route Handlers         |
| `/_not-found`, onboarding, sign-in | static    | public/static shell routes |

Analyzer artifacts were generated under `.next/analyze/`.

## First Load JS Baseline

Route first-load values come from `.next/diagnostics/route-bundle-stats.json` after the same branch build.
They are uncompressed bytes; gzip values are calculated from the emitted chunk files.

| item                               | chunk count | emitted size | gzip size | first-load uncompressed |
| ---------------------------------- | ----------- | ------------ | --------- | ----------------------- |
| shared root main files             | 5           | 456.7 KB     | 132.4 KB  | -                       |
| `/` unique chunks                  | 3           | 72.1 KB      | 20.1 KB   | 528.9 KB                |
| `/album` unique chunks             | 2           | 71.6 KB      | 19.7 KB   | 528.4 KB                |
| `/record` unique chunks            | 4           | 366.8 KB     | 100.6 KB  | 823.5 KB                |
| `/settings` unique chunks          | 4           | 356.0 KB     | 97.6 KB   | 812.7 KB                |
| `/memory/[memoryId]` unique chunks | 4           | 354.6 KB     | 97.1 KB   | 811.3 KB                |

`/record`, `/settings`, and `/memory/[memoryId]` carry the largest client-side first-load cost. This PR does not add runtime client dependencies, and the measured first-load values matched `origin/main` after `pnpm build:ci`:

| route                | origin/main | this branch | delta |
| -------------------- | ----------- | ----------- | ----- |
| `/`                  | 528.9 KB    | 528.9 KB    | 0%    |
| `/album`             | 528.4 KB    | 528.4 KB    | 0%    |
| `/record`            | 823.5 KB    | 823.5 KB    | 0%    |
| `/settings`          | 812.7 KB    | 812.7 KB    | 0%    |
| `/memory/[memoryId]` | 811.3 KB    | 811.3 KB    | 0%    |

## Visual QA Scope

フォント weight 削減後は、少なくとも以下の5画面で見た目の大きな変化がないことを確認する。

| page           | focus                                   | status |
| -------------- | --------------------------------------- | ------ |
| `/`            | hero title / recent memory titles       | todo   |
| `/album`       | list title / card titles                | todo   |
| `/memory/{id}` | detail title / body serif readability   | todo   |
| `/record`      | form labels / title / AI consent dialog | todo   |
| `/settings`    | account and child cards                 | todo   |

This table is a merge-before-release human gate. The automated checks confirm the font file request changed from `400;500;700` to `400;700`; visual acceptability still requires browser review.

## Follow-up Rule

- `pnpm analyze` で `.next/analyze/` を生成して、重い依存追加時に HTML を確認する。
- CI には analyzer を常時載せない。bundle diff comment は将来 Issue で検討する。
- First Load JS の数値が build output に戻った場合は、このファイルへ route 別に追記する。
