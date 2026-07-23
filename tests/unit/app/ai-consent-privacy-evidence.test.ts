import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const evidenceSource = readFileSync(
  new URL('../../../docs/design/ai-consent-privacy-evidence.md', import.meta.url),
  'utf8',
)
const securityGuide = readFileSync(
  new URL('../../../docs/api-driven-development/security-and-privacy.md', import.meta.url),
  'utf8',
)

describe('AI consent privacy evidence', () => {
  it('keeps active UI free of unsupported training and zero-retention claims', () => {
    const activeUi = `${recordSource}\n${settingsSource}`

    expect(activeUi).not.toMatch(/zero data retention/i)
    expect(activeUi).not.toMatch(/(^|[^3])0日/)
    expect(activeUi).not.toContain('保持期間')
    expect(activeUi).not.toContain('学習にも つかわれません')
    expect(activeUi).not.toContain('学習にも使われません')
    expect(activeUi).not.toContain('学習に つかいません')
    expect(activeUi).not.toContain('いちじてきに')
    expect(activeUi).not.toContain('公開前に明記します')
  })

  it('shows opt-in status and the AI data boundary in settings', () => {
    expect(settingsSource).toContain('AI は同意後だけ使います')
    expect(settingsSource).toContain('Anthropic Claude API')
    expect(settingsSource).toContain('おくるもの')
    expect(settingsSource).toContain('おくらないもの')
    expect(settingsSource).toContain('登録した呼び名')
    expect(settingsSource).toContain('たんじょうび / メール / じゅうしょ')
    expect(settingsSource).toContain('presigned URL')
    expect(settingsSource).toContain('画像URL / presigned URL / 保存先のキー')
    expect(settingsSource).toContain('通常30日以内に削除されます')
    expect(recordSource).toContain('通常30日以内に削除されます')
    expect(recordSource).toContain('安全確認など一部例外があります')
  })

  it('records current vendor evidence and keeps human privacy review as a release gate', () => {
    expect(evidenceSource).toContain('last_verified: 2026-07-23')
    expect(evidenceSource).toContain('https://privacy.claude.com/en/articles/7996866')
    expect(evidenceSource).toContain('https://privacy.claude.com/en/articles/8956058')
    expect(evidenceSource).toContain('https://support.claude.com/en/articles/11174108')
    expect(evidenceSource).toContain('Do not claim 0-day retention')
    expect(evidenceSource).toContain('human reviewer must confirm')
    expect(securityGuide).toContain('docs/design/ai-consent-privacy-evidence.md')
    expect(securityGuide).toContain('human privacy / legal review')
  })
})
