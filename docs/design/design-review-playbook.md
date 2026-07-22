# Hana Design Review Playbook

この playbook は、Hana のデザイン再構築 Issue を Codex で進める時のレビュー入口、
完了条件、証跡ルールを定義する。役割定義は `docs/design/design-organization.md`、
サブエージェント依頼文は `docs/design/subagent-prompt-templates.md` を正とする。

---

## 1. Design Review の原則

- 画面をきれいにする前に、30秒記録フローと privacy trust を壊していないかを見る。
- 「いい感じ」では承認しない。blocker / warning / required evidence / next action に分けて記録する。
- 実データ、子どもの写真、画像 URL、storage_key、AI 生成本文をレビュー証跡に残さない。
- v0-output は参考資料であり、設計の正本ではない。`src/` へ丸ごとコピーしない。
- レビューが割れた場合、Issue Captain が Adopt / Defer / Reject を明記する。

---

## 2. Phase Gates

| Phase                  | Entry 条件                                                                  | 必須 reviewers                                       | Exit 条件                                                               |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Intake                 | GitHub Issue と local Issue 正本があり、scope / out-of-scope が書かれている | Design Lead、Privacy / Trust                         | Go / Hold / No-Go と追加すべき reviewer が決まっている                  |
| Principles Check       | 対象 flow / screen と Hana 原則への仮説が書かれている                       | Head of Design、Product UX、Content                  | 30秒、責めない、Album not feed、AI invisible の逸脱がない               |
| Flow Review            | 画面状態、空状態、失敗状態、戻る導線、片手操作が説明されている              | Product UX、Accessibility、Engineering               | 主要タスクが迷わず完了でき、実装分割が1 Issueに収まる                   |
| Content / Trust Review | copy、同意、AI/写真/削除/共有の不安点が列挙されている                       | Content、Privacy / Trust                             | 禁止表現、PII証跡、同意不足、過度なAI露出がない                         |
| Visual / A11y Review   | token、typography、motion、component 変更が説明されている                   | Visual / Brand、Accessibility、DesignOps             | contrast、44px hit area、focus、reduced motion、ブランド抑制が通る      |
| PR Review              | PR、検証コマンド、必要なら screenshot / manual QA 手順がある                | 変更内容に応じた2名以上。privacy/image/AI は必須追加 | blocking finding がなく、未解決事項は future Issue / blocker に分離済み |
| Release Check          | `pnpm pr:gate` と必要なQAが通り、rollback が書ける                          | Design Lead、Privacy / Trust、Engineering            | ready_to_merge / Hold / No-Go を PR に記録する                          |

---

## 3. Mandatory Review Coverage

| 変更内容                         | 必須 review                              |
| -------------------------------- | ---------------------------------------- |
| core flow / navigation           | Product UX、Engineering                  |
| empty / error / success copy     | Content、Privacy / Trust                 |
| child photo / AI consent / share | Privacy / Trust、Content、Engineering    |
| component / token / motion       | Visual / Brand、Accessibility、DesignOps |
| performance perception           | Product UX、Engineering、Accessibility   |
| release readiness                | Head of Design、Privacy / Trust          |

Privacy / Accessibility / Content / Brand / Product UX のどれかが不要に見える場合でも、
不要と判断した理由を PR に残す。

---

## 4. Evidence Format

PR には以下を短く残す。

```markdown
### Design Review Ledger

- Head of Design: pass | warning | blocker
- Product UX: pass | warning | blocker
- Content: pass | warning | blocker
- Visual / Brand: pass | warning | blocker
- Accessibility: pass | warning | blocker
- Privacy / Trust: pass | warning | blocker
- Engineering Design: pass | warning | blocker

### Open Decisions

- Adopt:
- Defer:
- Reject:

### Evidence

- Reviewed surfaces:
- Commands:
- Manual QA:
- Sensitive data policy: no real child/parent names, image URLs, storage keys, or AI text included
```

---

## 5. Exit Criteria

Design Issue を PR-ready にする条件:

- local Issue の受け入れ条件が検証可能な形で満たされている。
- reviewer の blocking finding が残っていない。
- warning は follow-up / future Issue / human gate のいずれかに分類されている。
- 証跡に PII、画像 URL、storage_key、AI 生成本文が含まれていない。
- `pnpm pr:gate` が通る。docs-only の場合でも実行し、失敗時は理由を PR に残す。
- Rollback が `revert PR <number> / data impact: none` と書ける。

---

## 6. Stop Rules

以下の場合は `blocked` または human review に戻す。

- 実データや本物の子ども写真が必要になった。
- AI 送信、ベンダー保持、privacy policy、App Store privacy labels の判断が必要になった。
- OpenAPI / DB / auth / storage 変更が必要になったが、Issue の scope 外だった。
- reviewer 間の判断が割れ、Issue Captain が Adopt / Defer / Reject で裁けない。
- UI刷新が半日から2日の PR 粒度を超えた。
