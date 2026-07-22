# Hana Design Evaluation Rubric

この rubric は、Hana の画面やフローを「一般的に整っているか」ではなく、
Hana らしい体験になっているかで判断するための評価基準である。

対象は UI 実装、デザイン案、画面 inventory、PR review、release 前確認。
現行画面の棚卸しは ISSUE-045 でこの rubric を使って行う。

---

## 1. Judgment Model

### 5段階評価

| score | label     | 意味                                                                 |
| ----- | --------- | -------------------------------------------------------------------- |
| 5     | Excellent | Hana 原則を強め、証跡も十分。追加対応なしで進められる                |
| 4     | Good      | 大きな問題はない。軽微な warning は PR または follow-up に残せばよい |
| 3     | Adequate  | 最低限は満たすが、Hana らしさや証跡が弱い。改善 Issue 候補           |
| 2     | Weak      | 体験・信頼・アクセシビリティのいずれかに明確な不足がある。Hold       |
| 1     | Broken    | 責める、漏洩する、迷わせる、同意を隠すなどの blocker がある。No-Go   |

### Go / Hold / No-Go

| 判定  | 条件                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| Go    | blocker なし。主要評価軸がすべて3以上、Privacy Trust と Task Success は4以上         |
| Hold  | blocker はないが、主要評価軸に2がある。warning の責任者と follow-up が明確           |
| No-Go | PII / image URL / storage_key / AI本文の露出、同意不足、責めるcopy、完了不能flowあり |

Privacy Trust / Content Safety / Accessibility / Task Success の blocker は、平均点で相殺しない。

---

## 2. Rubric Axes

| axis                          | 5 の状態                                                    | 3 の状態                                         | 1-2 の状態                                                                 |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Task Success / 30秒記録       | 写真選択から保存まで迷わず進み、primary action が親指圏内   | 完了できるが迷い、余計な入力、待ち不安がある     | 保存完了までの導線が途切れる、戻れない、30秒体験を明確に壊す               |
| Forgiving UX                  | 空白、失敗、復帰、キャンセルを責めず、自然に戻れる          | 直接責めないが事務的、または復帰導線が弱い       | ストリーク、恐怖訴求、完璧主義、未記録日への圧がある                       |
| Emotional Resonance           | 写真が私的な記憶に変わる感覚があり、読み返したくなる        | 記録としては成立するが、記憶としての温度が弱い   | SNS/feed/業務記録のように見える、感情を押し付ける                          |
| Privacy Trust                 | 写真、AI同意、削除、共有、証跡が不安を増やさない            | 大きな漏れはないが、説明や同意のタイミングが弱い | PII、画像URL、storage_key、AI本文、同意不足、隠れた送信に見える表現がある  |
| Content Safety / AI Quietness | 日本語が柔らかく、AIは黒子。ただしAI利用の同意は明示        | 禁止表現はないが、温度がやや硬い                 | 発達断定、罪悪感、親への圧、恐怖訴求、AI生成の押し出し、同意の曖昧化がある |
| Accessibility / Mobile        | 44px tap、7:1 body contrast、focus、reduced motion、altあり | 一部は未確認だが、修正可能な warning に留まる    | 小さすぎるtap、読めないcontrast、motion強制、読み上げ不能、片手操作不能    |
| Visual / Brand Consistency    | Album not feed / Whisper not shout が一貫している           | tokenや余白に小さなばらつきがある                | 派手な装飾、feed化、gradient/glass luxury、写真が詰まりすぎる              |
| Performance Perception        | 待ち時間が静かに説明され、skeleton/error/retryが安心        | 技術的には動くが、待ち時間の不安が残る           | AI生成中や画像表示で放置感、失敗時に戻れない、過剰prefetchで体験を壊す     |
| Engineering Feasibility       | 1 Issue 1 PRで実装可能、API/DB/auth/storage影響が明確       | 実装可能だがscope分割や追加QAが必要              | OpenAPI/DB/auth/image/AIに波及するのに設計・テスト・rollbackがない         |

---

## 3. Hana HEART Translation

| HEART        | Hana での意味                                | 観察・証跡例                                  | 注意点                                       |
| ------------ | -------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Happiness    | 見返した時の満足、安心、記憶としての温度     | 1問アンケート、感情的違和感メモ、レビュー分類 | 本文そのものや実ユーザーの感情記録を残さない |
| Engagement   | 記録と見返しが自然に起こること               | 保存記録数、見返しセッション割合              | streak や圧で増やさない                      |
| Adoption     | 初回で価値が伝わり、最初の記録まで行けること | 登録完了率、初回記録完了率、初回離脱点        | 初回から入力や同意を詰め込みすぎない         |
| Retention    | 空白期間のあとも戻ってきやすいこと           | Day7 / Day30、復帰時の記録率                  | 「久しぶり」圧や未記録日の可視化を避ける     |
| Task Success | 写真選択から保存完了まで短く確実に終わること | 記録完了率、AI生成→保存率、平均所要時間       | PRD目標とUI手触りの両方を見る                |

Hana では HEART を単独の数値で採点しない。rubric の定性評価と合わせて Go / Hold / No-Go を決める。

---

## 4. Review Checklist

### Screen / Flow Review

- [ ] 対象画面 / flow / state が列挙されている
- [ ] 主要タスクが30秒記録体験を壊していない
- [ ] primary action が mobile first / one-handed に配置されている
- [ ] empty / loading / error / success が責めない表現になっている
- [ ] AIが主役になりすぎず、AI利用の同意は明示されている
- [ ] 写真表示、削除、共有、AI送信で trust risk が評価されている
- [ ] accessibility と performance perception の warning が分離されている

### Release / PR Review

- [ ] Design Review Report がPRに添付されている
- [ ] Privacy Trust と Accessibility の reviewer が必要性を判定している
- [ ] blocker / warning / follow-up が分離されている
- [ ] screenshot や証跡に PII、画像 URL、storage_key、AI 生成本文がない
- [ ] `pnpm pr:gate` と必要な manual QA が記録されている
- [ ] rollback が書ける

---

## 5. ISSUE-045 Inventory Table

ISSUE-045 の画面棚卸しでは、この表を画面または flow ごとに使う。

| surface | flow / state | HEART | Task | Forgiving | Emotional | Trust | Content | A11y | Brand | Perf | Eng risk | verdict | priority | follow-up |
| ------- | ------------ | ----- | ---- | --------- | --------- | ----- | ------- | ---- | ----- | ---- | -------- | ------- | -------- | --------- |
| TBD     | TBD          | TBD   | TBD  | TBD       | TBD       | TBD   | TBD     | TBD  | TBD   | TBD  | TBD      | TBD     | TBD      | TBD       |

Score は 1-5、verdict は Go / Hold / No-Go。follow-up は半日から2日の Issue 粒度で書く。

---

## 6. Subagent Review Request Templates

### UX Research / HEART

```text
Read-only Hana design rubric review. Do not edit files.
Focus: UX Research and HEART translation.
Check whether the target screen or flow supports Happiness, Engagement,
Adoption, Retention, and Task Success without adding guilt or pressure.
Return scores, blockers, warnings, and evidence gaps.
Use only fake/anonymized data.
```

### Privacy / Trust / Content Safety

```text
Read-only Hana design rubric review. Do not edit files.
Focus: Privacy Trust, Content Safety, and Emotional Resonance.
Check child photo trust, AI consent, deletion/share copy, empty/error/success copy,
and whether any evidence includes PII, image URLs, storage_key, prompts, or AI text.
Return No-Go blockers first, then warnings and follow-ups.
```

### Product / A11y / Engineering

```text
Read-only Hana design rubric review. Do not edit files.
Focus: Product UX, Accessibility, Performance Perception, and Engineering Feasibility.
Check 30-second task success, one-handed mobile, 44px tap targets, contrast,
reduced motion, skeleton/error states, testability, and 1 Issue 1 PR feasibility.
Return scores, blockers, warnings, and implementation split recommendations.
```

---

## 7. Design Review Report Template

```markdown
## Design Review Report

### Target

- Issue:
- PR:
- Screen / flow:
- Reviewed date:

### Scorecard

| axis                          | score | evidence | blocker / warning / pass |
| ----------------------------- | ----- | -------- | ------------------------ |
| Task Success / 30秒記録       |       |          |                          |
| Forgiving UX                  |       |          |                          |
| Emotional Resonance           |       |          |                          |
| Privacy Trust                 |       |          |                          |
| Content Safety / AI Quietness |       |          |                          |
| Accessibility / Mobile        |       |          |                          |
| Visual / Brand Consistency    |       |          |                          |
| Performance Perception        |       |          |                          |
| Engineering Feasibility       |       |          |                          |

### Verdict

- Go / Hold / No-Go:
- Reason:

### Review Ledger

- UX Research / HEART:
- Privacy / Trust / Content:
- Product / A11y / Engineering:

### Follow-ups

- P0:
- P1:
- P2:

### Evidence Policy

- Real child/parent names: none
- Image URL / presigned URL / storage_key: none
- AI generated memory text or prompt: none
- Screenshots use fake or anonymized data only
```

---

## 8. No-Go Examples

- 「○日間記録していません」「ストリークが切れました」などの guilt copy。
- AI利用や写真送信を視覚的に隠し、同意が曖昧になる設計。
- 実ユーザーの写真、画像URL、storage_key、AI生成本文をPR証跡に残すこと。
- 主要CTAが片手で届かない、tap target が小さい、contrast が読めない状態。
- feed、ランキング、いいね、比較、過度な通知など、私的なアルバム体験を壊す設計。
