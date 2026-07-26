import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-087-home-album-shelf-latest.md', import.meta.url),
  'utf8',
)
const issue075Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-075-lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)

describe('ISSUE-087 Home album shelf includes latest memory', () => {
  it('keeps the featured memory in the horizontal album shelf', () => {
    expect(homeSource).toContain('const featuredMemory = memories[0] ?? null')
    expect(homeSource).toContain('const shelfMemories = memories')
    expect(homeSource).not.toContain('const shelfMemories = memories.slice(1)')
    expect(homeSource).toContain('shelfMemories.map((m, index) =>')
  })

  it('separates the featured card and album shelf roles with quiet copy and label', () => {
    expect(homeSource).toContain('最近のページ')
    expect(homeSource).toContain(
      "const shelfTitle = memories.length === 1 ? 'アルバムのページ' : '最近のページたち'",
    )
    expect(homeSource).toContain('{shelfTitle}')
    expect(homeSource).toContain('アルバムのページ')
    expect(homeSource).toContain('最近のページたち')
    expect(homeSource).toContain('大きく見たページも、ここからまた開けます。')
    expect(homeSource).toContain('index === 0')
    expect(homeSource).toContain('最近')
    expect(homeSource).not.toMatch(/ランキング|順位|人気|feed|投稿|いいね/i)
  })

  it('keeps shelf cards responsive and accessible on compact viewports', () => {
    expect(homeSource).toContain('snap-x')
    expect(homeSource).toContain('scroll-px-6')
    expect(homeSource).toContain('overflow-x-auto')
    expect(homeSource).toContain('w-[148px] shrink-0 snap-start')
    expect(homeSource).toContain(
      'paper-surface ease-organic block rounded-[var(--radius-paper-slip)] p-2',
    )
    expect(homeSource).toContain('focus-visible:ring-2')
    expect(homeSource).toContain('tap-target')
    expect(homeSource).toContain('min-h-7')
  })

  it('tracks the issue and keeps public trust blockers separate', () => {
    expect(issueSource).toContain('github_issue: 194')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('Home の横スクロール棚にも最新ページ')
    expect(issueSource).toContain('実写真 URL、`storage_key`、AI 生成本文、メール')
    expect(issue075Source).toContain('status: done')
  })
})
