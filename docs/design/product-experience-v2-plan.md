# Hana Product Experience V2 計画

`ISSUE-059` までの Quiet Heirloom 画面刷新は Go 判定になった。
次フェーズは、見た目の追加装飾ではなく、Hana を「子どもの記録を預けられるプロダクト」として整える。

## 判断

Go。

ただし、次の UI 変更では「できること」と「active UI が約束していること」の整合、
settings の trust surface、実 DOM の a11y / visual QA を blocker として扱う。

## サブエージェント統合メモ

最大 10 名までの方針で着手し、実行環境の同時起動上限により 6 名の専門サブエージェントで設計レビューを行った。
各レビューは read-only とし、実写真、production data、画像 URL、`storage_key`、prompt、AI 生成本文は参照・証跡化していない。

| 役割                   | 主な指摘                                         | 次フェーズでの扱い                           |
| ---------------------- | ------------------------------------------------ | -------------------------------------------- |
| Product Design Systems | active UI の約束と実装済み機能のズレが信頼を削る | `ISSUE-060` で最初に解消                     |
| Frontend Architecture  | page shell / surface が各画面に散っている        | `ISSUE-060` で最小共通化                     |
| Mobile Interaction     | 保存後に「1 ページになった」手触りが弱い         | `ISSUE-063` で record / detail へ展開        |
| Accessibility          | 実 DOM の a11y gate が次の blocker               | `ISSUE-064` で QA v2 化                      |
| Trust / Privacy UX     | settings を trust center として再構成すべき      | `ISSUE-061` で展開、`ISSUE-060` で土台を置く |
| Visual QA / Automation | screenshot 代表状態だけでなく実 DOM 契約が必要   | `ISSUE-064` で read-only smoke を追加        |

## Issue Sequence

| order | issue       | title                                       | target                                                                   |
| ----- | ----------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | `ISSUE-060` | プロダクト体験 V2: 約束整合と共通シェル基盤 | active UI の約束、共通 shell / surface、settings / onboarding の最小整合 |
| 2     | `ISSUE-061` | Settings Trust Center v1                    | AI と写真、送るもの / 送らないもの、削除とデータ、準備中の明示           |
| 3     | `ISSUE-062` | Onboarding to First Memory Bridge           | 登録完了から最初の記録へ自然につなぐ                                     |
| 4     | `ISSUE-063` | Record Saved Moment and Memory Landing      | 保存完了後に「ページになった」体験を作る                                 |
| 5     | `ISSUE-064` | Product Design QA v2                        | 実 DOM / a11y / visual contract smoke を追加                             |

## Evidence Policy

- 実ユーザーの写真、名前、メール、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文を貼らない
- child name が必要な UI 証跡は `はな` / `あお` のような synthetic name を使う
- settings の privacy copy は、公式 evidence と人間レビューが済むまで強い保証表現にしない
- 未実装機能は active UI で「近日対応」「あとでできる」と約束しない
