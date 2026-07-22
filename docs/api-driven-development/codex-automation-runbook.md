# Codex 自動開発 Runbook

この文書は、Codex が Hana の Issue を自動で進めるときの運用手順を定義する。

目的は「完全自動で merge すること」ではない。Codex が **Draft PR / ready_to_merge 候補** まで安全に進め、人間がレビュー・merge・release を判断できる状態を作る。

---

## 1. 基本方針

- 1 Issue 1 branch 1 PR を守る。
- メイン Codex は **Issue Captain** として、スコープ、実装、検証、PR 記録を統合する。
- サブエージェントは短命の専門レビュー役として使う。原則として staging / commit / PR 作成はしない。
- privacy / security / DB migration / AI vendor / release 判断は人間承認ゲートで止める。
- rollback できるように、Issue / PR / Git の 3 層に記録を残す。

---

## 2. 自動で進めてよい範囲

Codex が自動で進めてよい:

- docs / tests / CI / low-risk UI polish
- 明確な acceptance criteria がある小〜中サイズ Issue
- OpenAPI 変更を伴わない軽微な修正
- API 変更でも OpenAPI-first の手順と contract guard が通るもの

人間確認で止める:

- child photo / image URL / storage_key / AI prompt / AI vendor / generated text
- auth / ownership / DB migration / account deletion
- OpenAPI breaking change
- production deploy / merge / release
- destructive command

---

## 3. Issue Start Gate

着手前に Issue Captain は以下を確認する。

1. `git status --short --branch`
2. target Issue の目的、スコープ、Out of Scope、受け入れ条件
3. PRD の該当章
4. API 影響がある場合は `docs/openapi/openapi.yaml`
5. 既存の unrelated diff が混入しないこと

開始時に 3〜10 行で宣言する:

- この Issue の目的
- 変更する領域
- 影響しうる領域
- OpenAPI 変更の有無
- 検証コマンド
- 人間レビューが必要な理由があればその理由

---

## 4. サブエージェント運用

並行実行は最大 3 本まで。

推奨ロール:

| ロール                    | 使うタイミング                       | 出力                                       |
| ------------------------- | ------------------------------------ | ------------------------------------------ |
| Spec Scout                | 着手前                               | Issue / PRD / ADR / test の矛盾、影響範囲  |
| Contract Guard            | API 変更時                           | OpenAPI-first 変更計画、breaking risk      |
| Privacy/Security Reviewer | auth / image / AI / logs / DB 変更時 | blocker / warning / 必須 test              |
| QA Reviewer               | 実装後                               | acceptance criteria の pass/fail、検証不足 |
| Design/UX Reviewer        | 画面変更時                           | mobile / a11y / visual QA 観点             |

サブエージェントに渡す指示:

```text
Do not edit files. Return blockers, warnings, and concrete next actions only.
```

編集を任せる場合は、Issue Captain が明示した disjoint write scope に限定する。

---

## 5. Implementation Loop

API 変更あり:

1. `docs/openapi/openapi.yaml` を先に更新する
2. `pnpm openapi:lint`
3. `pnpm openapi:gen`
4. 生成差分を確認する
5. Route Handler / feature logic / tests を実装する

API 変更なし:

1. target Issue に関係するファイルだけ読む
2. 最小の complete slice で実装する
3. 対象 test を追加・更新する

禁止:

- `src/lib/api/generated/` の手編集
- unrelated refactor
- unrelated issue のついで修正
- PII を含む fixture / log / PR 記録

---

## 6. Verification Gate

通常の PR-ready 判定:

```bash
pnpm pr:gate
```

`pnpm pr:gate` が未導入の branch では、暫定 fallback として以下を実行する。
ISSUE-034 merge 後は `pnpm pr:gate` を正規ゲートにする。

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

API 変更時:

```bash
pnpm openapi:lint
pnpm openapi:gen
```

必要に応じて追加:

- UI 変更: mobile / keyboard / reduced motion / screenshot 確認
- DB 変更: migration / rollback 方針確認
- AI 変更: prompt regression / PII leakage 確認
- image 変更: public URL / storage_key / cache / deletion 確認

---

## 7. PR 記録

PR には以下を残す。

### Issue Brief

- Issue ID / title
- Why
- Scope
- Out of Scope
- Acceptance Criteria

### Change Ledger

- OpenAPI changed: yes/no
- Generated types changed: yes/no
- DB migration: yes/no
- Env change: yes/no
- User-facing change: yes/no

### Validation Ledger

- 実行コマンド
- 結果
- 失敗した場合の要約
- 未実施なら理由

### Privacy Ledger

- PII log: checked / not applicable
- image URL / storage_key exposure: checked / not applicable
- AI prompt / generated text storage: checked / not applicable
- auth / ownership: checked / not applicable

### PR Draft

- Title: `[ISSUE-XXX] <要約>`
- Body: Issue Brief / Change Ledger / Validation Ledger / Privacy Ledger / Rollback Record を含める
- Link: `Closes #<GitHub issue number>`
- State: 自動作成時は Draft PR から始める
- Review loop: ベテランエンジニアレビューを最大 3 回まで反映し、残る指摘は PR に明記する
- Merge note: merge / release / deploy に人間承認が必要な場合は明記する

### Rollback Record

```text
Rollback: revert PR <number> / commit <sha>
Data impact: none | migration | storage | unknown
User impact:
Recovery steps:
Verification after rollback:
```

---

## 8. ready_to_merge 条件

`ready_to_merge` は「自動検証が揃った候補」であり、production release の承認ではない。

条件:

- すべての acceptance criteria が満たされている
- `pnpm pr:gate` が通っている（未導入 branch では Verification Gate の fallback が通っている）
- API 変更時の OpenAPI lint / gen が通っている
- unrelated diff がない
- privacy gate が通っている
- rollback record が PR にある
- human review が必要な項目が明示されている

---

## 9. Stop / Block Rules

Codex は以下で止まる。

- 同じ失敗が 3 回続いた
- Issue のスコープを超える変更が必要
- OpenAPI と実装のどちらが正か不明
- PII / secret / child photo / storage_key の露出疑い
- destructive operation が必要
- DB reset / force push / auto merge / production deploy が必要

止まったら Issue を `blocked` にするか、PR に missing decision を明記する。
