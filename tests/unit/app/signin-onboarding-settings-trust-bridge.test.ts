import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'

const signInSource = readFileSync(
  new URL('../../../src/app/sign-in/page.tsx', import.meta.url),
  'utf8',
)
const onboardingSource = readFileSync(
  new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const surfacesSource = readFileSync(
  new URL('../../../src/components/product/surfaces.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-080-signin-onboarding-settings-trust-bridge.md',
    import.meta.url,
  ),
  'utf8',
)
const privacyEvidenceSource = readFileSync(
  new URL('../../../docs/design/ai-consent-privacy-evidence.md', import.meta.url),
  'utf8',
)

describe('ISSUE-080 Sign-in / Onboarding / Settings trust bridge', () => {
  it('turns sign-in into a paper entry surface and removes unsupported future claims', () => {
    expect(signInSource).toContain('FocusedShell')
    expect(signInSource).toContain('StatePanel')
    expect(signInSource).toContain('data-testid="signin-trust-bridge"')
    expect(signInSource).toContain('aria-labelledby="signin-trust-title"')
    expect(signInSource).toContain('id="signin-trust-title"')
    expect(signInSource).toContain('サインインだけでは、写真や記録は作成されません。')
    expect(signInSource).toContain('AI を使う前に、送るものを確認します。')
    expect(signInSource).toContain('この先も、必要な確認をひとつずつ表示します。')
    expect(signInSource).toContain('QuietIcon icon={ImagePlus}')
    expect(signInSource).toContain('QuietIcon icon={PenLine}')
    expect(signInSource).not.toContain('Card')
    expect(signInSource).not.toContain('Apple での サインイン')
    expect(signInSource).not.toContain('ちかぢか')
    expect(signInSource).not.toContain('近日対応')
    expect(signInSource).not.toContain('Store')
  })

  it('explains onboarding data use before registration without overclaiming AI handling', () => {
    expect(onboardingSource).toContain('data-testid="onboarding-trust-bridge"')
    expect(onboardingSource).toContain('aria-labelledby="onboarding-trust-title"')
    expect(onboardingSource).toContain('id="onboarding-trust-title"')
    expect(onboardingSource).toContain('呼び名は、記録の見出しや下書きで呼ぶために使います。')
    expect(onboardingSource).toContain('たんじょうびそのものではなく月齢として扱います。')
    expect(onboardingSource).toContain('この登録だけでは、写真や記録は作成されません。')
    expect(onboardingSource).toContain('QuietIcon icon={ShieldCheck}')
    expect(onboardingSource).not.toMatch(/zero data retention/i)
    expect(onboardingSource).not.toContain('完全に削除されます')
    expect(onboardingSource).not.toContain('復元できます')
  })

  it('separates settings overview, AI boundary, data boundary, and future items', () => {
    expect(settingsSource).toContain('data-testid="settings-trust-overview"')
    expect(settingsSource).toContain('data-testid="settings-ai-boundary"')
    expect(settingsSource).toContain('data-testid="settings-data-boundaries"')
    expect(settingsSource).toContain('data-testid="settings-future-boundary"')
    expect(settingsSource).toContain('icon={ShieldCheck}')
    expect(settingsSource).toContain('icon={FileText}')
    expect(settingsSource).toContain('icon={Database}')
    expect(settingsTrustCenterCopy.current.eyebrow).toBe('概要')
    expect(settingsTrustCenterCopy.page.description).toContain('まだ約束しないこと')
    expect(settingsTrustCenterCopy.current.description).toContain('AI、削除、将来項目')
    expect(settingsTrustCenterCopy.ai.description).toContain('送るものと送らないもの')
    expect(settingsTrustCenterCopy.ai.handlingValue).toContain('商用 API 条件')
    expect(settingsTrustCenterCopy.ai.handlingValue).toContain('確認した範囲だけ')
    expect(settingsTrustCenterCopy.ai.handlingValue).not.toContain('通常30日以内')
    expect(settingsTrustCenterCopy.ai.handlingValue).not.toContain('人間のレビュー')
  })

  it('keeps the TrustSection icon API aligned with quiet lucide language', () => {
    expect(surfacesSource).toContain('icon?: LucideIcon')
    expect(surfacesSource).toContain('iconTone?: QuietIconTone')
    expect(surfacesSource).toContain('<QuietIcon icon={icon} tone={iconTone} />')
    expect(surfacesSource).toContain('className="min-w-0"')
    expect(surfacesSource).toContain('break-words')
    expect(surfacesSource).toContain('size-11')
    expect(surfacesSource).not.toContain('Sparkles')
    expect(surfacesSource).not.toContain('WandSparkles')
  })

  it('records the scope and evidence boundary without embedding unsafe evidence', () => {
    expect(issueSource).toContain('github_issue: 179')
    expect(issueSource).toContain('生成画像内の copy / trust claim の転記')
    expect(issueSource).toContain('Auth / Storage / DB / API / OpenAPI には触れない')
    expect(issueSource).toContain(
      '実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メール',
    )
    expect(privacyEvidenceSource).toContain('Say that AI is optional and only runs after consent.')
    expect(privacyEvidenceSource).toContain('Name the data not sent')
  })
})
