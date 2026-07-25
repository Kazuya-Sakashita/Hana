import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'

const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const copySource = readFileSync(
  new URL('../../../src/lib/ui/settings-trust-center-copy.ts', import.meta.url),
  'utf8',
)
const qaSource = readFileSync(
  new URL('../../../docs/design/settings-trust-center-qa.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-061-settings-trust-center-v1.md', import.meta.url),
  'utf8',
)

describe('settings trust center', () => {
  it('renders settings from the trust center copy contract', () => {
    expect(settingsSource).toContain('settingsTrustCenterCopy')
    expect(settingsSource).toContain('settingsTrustCenterCopy.ai.sentValue')
    expect(settingsSource).toContain('settingsTrustCenterCopy.ai.notSentValue')
    expect(settingsSource).toContain('settingsTrustCenterCopy.ai.choiceValue')
    expect(settingsSource).toContain('settingsTrustCenterCopy.data.memoryDeleteValue')
    expect(settingsSource).toContain('settingsTrustCenterCopy.future.items.map')
    expect(settingsSource).toContain('data-testid="settings-trust-overview"')
    expect(settingsSource).toContain('data-testid="settings-ai-boundary"')
    expect(settingsSource).toContain('data-testid="settings-data-boundaries"')
    expect(settingsSource).toContain('role="status"')
  })

  it('keeps the AI and photo data boundary explicit', () => {
    expect(settingsTrustCenterCopy.ai.enabledTitle).toBe('AI の下書きを使えます')
    expect(settingsTrustCenterCopy.ai.disabledTitle).toBe('AI は同意後だけ使います')
    expect(settingsTrustCenterCopy.ai.sentValue).toContain('登録した呼び名')
    expect(settingsTrustCenterCopy.ai.notSentValue).toContain('たんじょうび')
    expect(settingsTrustCenterCopy.ai.notSentValue).toContain('presigned URL')
    expect(settingsTrustCenterCopy.ai.choiceValue).toContain('AI を使わずに')
    expect(settingsTrustCenterCopy.page.description).toContain('まだ約束しないこと')
    expect(settingsTrustCenterCopy.current.eyebrow).toBe('概要')
    expect(settingsTrustCenterCopy.ai.description).toContain('送るものと送らないもの')
    expect(settingsTrustCenterCopy.ai.handlingValue).toContain('商用 API 条件')
    expect(settingsTrustCenterCopy.ai.handlingValue).toContain('プライバシーレビュー')
    expect(settingsTrustCenterCopy.ai.handlingValue).toContain('確認した範囲だけ')
    expect(settingsTrustCenterCopy.ai.handlingValue).not.toContain('通常30日以内')
    expect(settingsTrustCenterCopy.ai.handlingValue).not.toContain('人間のレビュー')
  })

  it('does not promise unsupported deletion, restore, or future functionality', () => {
    expect(settingsTrustCenterCopy.data.description).toContain('復元機能は今は提供していません')
    expect(settingsTrustCenterCopy.data.memoryDeleteValue).toContain('この画面では約束しません')
    expect(settingsTrustCenterCopy.future.unavailable).toBe('今は操作できません。')
    expect(settingsTrustCenterCopy.future.items).toContain('export / 退会')

    expect(copySource).not.toMatch(/zero data retention/i)
    expect(copySource).not.toContain('完全に削除されます')
    expect(copySource).not.toContain('復元できます')
    expect(copySource).not.toContain('近日対応')
    expect(copySource).not.toContain('あとでできます')
  })

  it('records state, accessibility, and evidence QA policy', () => {
    expect(qaSource).toContain('State Matrix')
    expect(qaSource).toContain('child registered + AI consent')
    expect(qaSource).toContain('child registered + no AI consent')
    expect(qaSource).toContain('child missing')
    expect(qaSource).toContain('role="status"')
    expect(qaSource).toContain('ISSUE-064')
    expect(qaSource).toContain('synthetic account')
    expect(qaSource).toContain('production account の screenshot は使わない')
    expect(issueSource).toContain(
      'AI consent copy と settings copy の data boundary が一致している',
    )
    expect(issueSource).toContain('settings の状態別 QA 方針が docs/design に残っている')
  })
})
