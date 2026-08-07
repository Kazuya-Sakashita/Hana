import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const waitlistFormSource = readFileSync(
  new URL('../../../src/components/waitlist-signup-form.tsx', import.meta.url),
  'utf8',
)
const bottomNavSource = readFileSync(
  new URL('../../../src/components/bottom-nav.tsx', import.meta.url),
  'utf8',
)
const publicAssetUrl = new URL(
  '../../../public/lp/hana-public-keepsake-still-life.webp',
  import.meta.url,
)

describe('prelaunch public LP route', () => {
  it('routes unauthenticated root visitors to the public waitlist LP', () => {
    expect(homeSource).toContain("if (!user) redirect('/lp')")
    expect(lpSource).toContain('export default function LandingPage')
    expect(lpSource).toContain('data-public-lp="waitlist"')
    expect(bottomNavSource).toContain("'/lp'")
  })

  it('renders a real waitlist conversion path on the public route', () => {
    expect(lpSource).toContain('href="#waitlist-form"')
    expect(lpSource).toContain('待機リストに登録する')
    expect(lpSource).toContain('記録例を見る')
    expect(lpSource).toContain('<WaitlistSignupForm />')
    expect(waitlistFormSource).toContain('action="/v1/waitlist"')
    expect(waitlistFormSource).toContain("fetch('/v1/waitlist'")
    expect(waitlistFormSource).toContain('aria-live="polite"')
    expect(waitlistFormSource).toContain('aria-atomic="true"')
    expect(waitlistFormSource).toContain('aria-invalid={invalidField ===')
    expect(waitlistFormSource).toContain('emailRef.current?.focus()')
    expect(waitlistFormSource).toContain('consentRef.current?.focus()')
    expect(waitlistFormSource).toContain('プライバシーポリシー')
    expect(waitlistFormSource).toContain('response.status === 429')
    expect(waitlistFormSource).toContain('response.status >= 500')
    expect(waitlistFormSource).toContain('少し時間をおいてからお試しください')
    expect(waitlistFormSource).toContain('data-waitlist-accepted-guidance="prelaunch"')
    expect(waitlistFormSource).toContain(
      'β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限ります',
    )
    expect(waitlistFormSource).toContain('案内停止や登録情報の削除を希望する場合')
    expect(lpSource).toContain('<noscript>')
    expect(lpSource).toContain('#waitlist-form{display:none}')
    expect(waitlistFormSource).toContain('プライバシーポリシーを確認する')
  })

  it('keeps the public LP visual safe and free of private examples', () => {
    expect(existsSync(fileURLToPath(publicAssetUrl))).toBe(true)
    expect(lpSource).toContain('/lp/hana-public-keepsake-still-life.webp')
    expect(lpSource).toContain('公開前検証用の合成イメージです。実ユーザー写真ではありません。')
    expect(waitlistFormSource).toContain('privacy@hana.app')
    const publicContactRedacted = `${lpSource}\n${waitlistFormSource}`.replaceAll(
      'privacy@hana.app',
      '<public-contact>',
    )
    expect(publicContactRedacted).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  })

  it('keeps the public route aligned with the three-step value proof', () => {
    expect(lpSource).toContain('写真を選ぶ')
    expect(lpSource).toContain('写真 + タイトル')
    expect(lpSource).toContain('写真 + 短い本文')
    expect(lpSource).toContain('机の上の小さなくつした')
    expect(lpSource).toContain('あとで開ける小さなページ')
  })
})
