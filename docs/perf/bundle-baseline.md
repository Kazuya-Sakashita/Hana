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
| node    | local development runtime         |
| date    | 2026-07-22                        |
| output  | `.next/analyze/nodejs.html`       |
| output  | `.next/analyze/edge.html`         |
| output  | `.next/analyze/client.html`       |

## Font Inventory

`font-serif` の利用箇所を `rg` で棚卸しした結果、serif の強調は通常テキスト、`CardTitle` の `font-medium`、記録詳細タイトルの `font-medium`、一部の `font-normal` が中心。
Noto Serif JP の 500 weight を直接要求する箇所はないため、読み込み weight は `400` と `700` に削減した。

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

Analyzer artifacts from this run:

| artifact                    | size |
| --------------------------- | ---- |
| `.next/analyze/nodejs.html` | 632K |
| `.next/analyze/edge.html`   | 272K |
| `.next/analyze/client.html` | 420K |

## Visual QA Scope

フォント weight 削減後は、少なくとも以下の5画面で見た目の大きな変化がないことを確認する。

| page           | focus                                   | status |
| -------------- | --------------------------------------- | ------ |
| `/`            | hero title / recent memory titles       | todo   |
| `/album`       | list title / card titles                | todo   |
| `/memory/{id}` | detail title / body serif readability   | todo   |
| `/record`      | form labels / title / AI consent dialog | todo   |
| `/settings`    | account and child cards                 | todo   |

## Follow-up Rule

- `pnpm analyze` で `.next/analyze/` を生成して、重い依存追加時に HTML を確認する。
- CI には analyzer を常時載せない。bundle diff comment は将来 Issue で検討する。
- First Load JS の数値が build output に戻った場合は、このファイルへ route 別に追記する。
