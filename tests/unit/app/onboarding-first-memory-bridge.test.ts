import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const onboardingSource = readFileSync(
  new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
  'utf8',
)
const quietStateCopySource = readFileSync(
  new URL('../../../src/lib/ui/quiet-state-copy.ts', import.meta.url),
  'utf8',
)
const qaSource = readFileSync(
  new URL('../../../docs/design/onboarding-first-memory-bridge-qa.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-062-onboarding-first-memory-bridge.md', import.meta.url),
  'utf8',
)

describe('onboarding first memory bridge', () => {
  it('moves registration success into an accessible first-memory state', () => {
    expect(onboardingSource).toContain('successHeadingRef.current?.focus()')
    expect(onboardingSource).toContain('tabIndex={-1}')
    expect(onboardingSource).toContain('aria-labelledby="onboarding-success-title"')
    expect(onboardingSource).toContain('aria-describedby="onboarding-success-description"')
    expect(onboardingSource).toContain('role="status" aria-live="polite"')
    expect(onboardingSource).toContain('登録が完了しました。はじめてのページをつくる')
    expect(onboardingSource).toContain('はじめてのページをつくる')
    expect(onboardingSource).toContain('href="/record"')
  })

  it('keeps first-memory actions in the mobile thumb zone', () => {
    expect(onboardingSource).toContain('FIRST_MEMORY_PANEL_SHELL_CLASS')
    expect(onboardingSource).toContain('items-stretch justify-start px-0 py-0')
    expect(onboardingSource).toContain('min-h-dvh')
    expect(onboardingSource).toContain('mt-auto flex flex-col gap-3')
    expect(onboardingSource).toContain('pb-[calc(env(safe-area-inset-bottom)+1.5rem)]')
    expect(onboardingSource).toContain('data-testid="onboarding-first-memory-actions"')
    expect(onboardingSource).not.toContain('setTimeout')
  })

  it('keeps failure recovery gentle and evidence-safe', () => {
    expect(quietStateCopySource).toContain('入力はそのままなので、もういちど ためしてください。')
    expect(quietStateCopySource).toContain(
      'まだ 直せるところがあります。入力はそのままなので、たしかめてください。',
    )
    expect(onboardingSource).toContain('const hasFieldErrors = Object.keys(fieldErrors).length > 0')
    expect(onboardingSource).toContain('id="onboarding-validation-alert"')
    expect(onboardingSource).toContain('quietStateCopy.onboarding.validationFailed')
    expect(onboardingSource).toContain('role="alert"')
    expect(onboardingSource).toContain('onboardingFieldErrorCopy.name')
    expect(onboardingSource).toContain('onboardingFieldErrorCopy.birthdate')
    expect(onboardingSource).not.toContain('fields.name = err.message')
    expect(onboardingSource).not.toContain('fields.birthdate = err.message')
    expect(onboardingSource).toContain('setName(e.target.value)')
    expect(onboardingSource).toContain("clearFieldError('name')")
    expect(onboardingSource).toContain('setBirthdate(e.target.value)')
    expect(onboardingSource).toContain("clearFieldError('birthdate')")
    expect(onboardingSource).toContain('data-testid="onboarding-trust-bridge"')
    expect(onboardingSource).toContain('aria-labelledby="onboarding-trust-title"')
    expect(onboardingSource).toContain('この登録だけでは、写真や記録は作成されません。')
    expect(onboardingSource).toContain('たんじょうびそのものではなく月齢として扱います。')
    expect(qaSource).toContain('production account の screenshot は使わない')
    expect(qaSource).toContain('実写真、実名、メール、生年月日')
    expect(qaSource).toContain('presigned URL、`storage_key`、prompt、AI 生成本文')
    expect(issueSource).toContain('Evidence に PII / image URL / `storage_key`')
  })

  it('records the state and accessibility QA policy', () => {
    expect(qaSource).toContain('State Matrix')
    expect(qaSource).toContain('success')
    expect(qaSource).toContain('already registered')
    expect(qaSource).toContain('query error')
    expect(qaSource).toContain('role="status" aria-live="polite"')
    expect(qaSource).toContain('validation error は `role="alert"`')
    expect(qaSource).toContain('tabIndex={-1}')
    expect(issueSource).toContain('onboarding の状態別 QA 方針が docs/design に残っている')
  })
})
