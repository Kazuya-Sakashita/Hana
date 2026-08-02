---
id: ISSUE-157
title: 現行アプリのVisual・A11y・mobile・cross-browser baselineを作る
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 325
release_gate: product_quality
requires_human_review:
  - accessibility
  - design
---

# ISSUE-157: 現行アプリのVisual・A11y・mobile・cross-browser baselineを作る

## 目的 (Why)

現行Next.js画面と合成データを使うVisual/A11y/mobile/cross-browser回帰baselineを作る。

## スコープ (What)

- 主要routeと状態の現行UI検証
- 320〜768pxとChromium/WebKit相当の主要経路
- keyboard、zoom、overflow、motion、target size検証
- source hash付きbaseline manifest

## やらないこと (Out of Scope)

- 手書きHTMLを現行UIの合格証拠にすること
- 実ユーザー、実写真、生成本文、署名URLのartifact保存

## 受け入れ条件 (Acceptance Criteria)

- [ ] Home、Record、Album、Detail/Edit、Settings、Onboarding、Loading/Errorを現行routeから検証する
- [ ] 320、390、430、768pxとChromium、WebKit相当の主要経路を含める
- [ ] focus順、visible focus、keyboard、200% zoom、overflow、reduced motion、44px基準を検証する
- [ ] baseline manifestへcommit SHAと対象source hashを記録し、古い成果物を不合格にする
- [ ] screenshot、trace、fixtureに実ユーザー、実写真、生成本文、署名URLを含めない

## セキュリティ・プライバシー考慮

合成データと合成画像だけでartifactを作る。

## 参考

- GitHub Issue #325
- ISSUE-059
