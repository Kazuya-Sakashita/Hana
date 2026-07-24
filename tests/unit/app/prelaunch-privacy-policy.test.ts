import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const privacyPageSource = readFileSync(
  new URL('../../../src/app/privacy/page.tsx', import.meta.url),
  'utf8',
)
const bottomNavSource = readFileSync(
  new URL('../../../src/components/bottom-nav.tsx', import.meta.url),
  'utf8',
)

describe('prelaunch privacy policy route', () => {
  it('documents the waitlist purpose and conservative handling', () => {
    expect(privacyPageSource).toContain('プライバシーポリシー')
    expect(privacyPageSource).toContain('公開前検証')
    expect(privacyPageSource).toContain('メールアドレスを取得します')
    expect(privacyPageSource).toContain('待機リスト登録の管理')
    expect(privacyPageSource).toContain('β版のご案内')
    expect(privacyPageSource).toContain('正式リリースのお知らせ')
    expect(privacyPageSource).toContain('開発証跡にはメールアドレスを含めません')
  })

  it('does not make unverified AI, retention, or restore claims', () => {
    expect(privacyPageSource).not.toMatch(/zero data retention|0-day|学習に使いません|復元可能/i)
  })

  it('hides the authenticated bottom navigation on the public privacy page', () => {
    expect(bottomNavSource).toContain("'/privacy'")
  })
})
