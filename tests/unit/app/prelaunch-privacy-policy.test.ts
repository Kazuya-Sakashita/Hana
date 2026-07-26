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
    expect(privacyPageSource).toContain('待機リスト登録の前に')
    expect(privacyPageSource).toContain('公開前検証レビュー済み')
    expect(privacyPageSource).toContain('サービス内容や運用方法が変わる場合は更新します')
    expect(privacyPageSource).toContain('メールアドレスを取得します')
    expect(privacyPageSource).toContain('待機リスト登録の管理')
    expect(privacyPageSource).toContain('β版のご案内')
    expect(privacyPageSource).toContain('正式リリースのお知らせ')
    expect(privacyPageSource).toContain('開発証跡にはメールアドレスを含めません')
    expect(privacyPageSource).toContain('privacy@hana.app')
    expect(privacyPageSource).toContain('サービス名を明記せず')
  })

  it('renders privacy as a quiet public trust surface instead of text-only rules', () => {
    expect(privacyPageSource).toContain('data-public-privacy="waitlist"')
    expect(privacyPageSource).toContain('photo-mat mt-8 rounded-[var(--radius-sheet)] p-2')
    expect(privacyPageSource).toContain('bg-paper-slip rounded-[var(--radius-paper-slip)]')
    expect(privacyPageSource).toContain('paper-surface rounded-[var(--radius-paper-slip)]')
    expect(privacyPageSource).toContain('QuietIcon')
    expect(privacyPageSource).toContain('href="/lp"')
    expect(privacyPageSource).toContain('tap-target')
    expect(privacyPageSource).not.toContain('border-t py-5')
  })

  it('does not make unverified AI, retention, or restore claims', () => {
    expect(privacyPageSource).not.toMatch(
      /zero data retention|ZDR|0-day|vendor retention|AI training|学習に使いません|AI学習に使いません|復元可能|完全削除|法務確認済み|配信基盤を確定済み|メール配信基盤は確定/i,
    )
  })

  it('hides the authenticated bottom navigation on the public privacy page', () => {
    expect(bottomNavSource).toContain("'/privacy'")
  })
})
