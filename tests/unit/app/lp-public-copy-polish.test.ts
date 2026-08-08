import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const lpLoadingSource = readFileSync(
  new URL('../../../src/app/lp/loading.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-095-lp-copy-polish.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const evaluationSource = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)

describe('ISSUE-095 LP public copy polish', () => {
  it('normalizes visible LP count notation to 1枚', () => {
    expect(lpSource).toContain('写真に、あとでひらけることばを')
    expect(lpSource).toContain('写真を1枚選ぶところから')
    expect(lpSource).toContain('1枚を選び、短い見出しを添える')
    expect(lpSource).toContain('今日の1枚')
    expect(lpSource).not.toContain('1まい')
    expect(lpSource).not.toMatch(
      /30秒|短時間|写真だけの日も|まず1枚を置いておける|App Store 準備中|Google Play 準備中/,
    )
  })

  it('removes artifact-like public wording while preserving synthetic disclosure', () => {
    const publicLpSources = `${lpSource}\n${lpLoadingSource}`
    expect(publicLpSources).toContain('公開前の待機リスト')
    expect(publicLpSources).toContain(
      '公開前検証用の合成イメージです。実ユーザー写真ではありません。',
    )
    expect(publicLpSources).not.toContain('synthetic preview')
    expect(publicLpSources).not.toContain('Pre-launch waitlist')
    expect(publicLpSources).not.toContain('Before / After')
    expect(publicLpSources).not.toContain('Trust before waitlist')
    expect(publicLpSources).not.toContain('prototype')
    expect(publicLpSources).toContain('記録の変化')
    expect(publicLpSources).toContain('待機リストの前に')
  })

  it('records the issue and evaluation without weakening public trust boundaries', () => {
    expect(issueSource).toContain('github_issue: 214')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('`1まい` / `1枚`')
    expect(issueSource).toContain('synthetic preview')
    expect(evaluationSource).toContain('対応済み。ISSUE-095')
    expect(issueIndexSource).toContain('`ISSUE-095`')
    expect(issueIndexSource).toContain('`#214`')
    expect(issueIndexSource).toContain('LP の表記ゆれと artifact 文言を整える')
    expect(`${lpSource}\n${lpLoadingSource}`).not.toMatch(
      /zero data retention|ZDR|vendor retention|AI training|学習に使いません|完全削除|法務確認済み|メール配信基盤は確定/i,
    )
  })
})
