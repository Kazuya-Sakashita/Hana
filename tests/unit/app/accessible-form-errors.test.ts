import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const onboardingSource = readFileSync(
  new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
  'utf8',
)
const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const inputSource = readFileSync(
  new URL('../../../src/components/ui/input.tsx', import.meta.url),
  'utf8',
)
const globalStylesSource = readFileSync(
  new URL('../../../src/app/globals.css', import.meta.url),
  'utf8',
)
const qaSource = readFileSync(
  new URL('../../../docs/design/accessible-form-error-qa.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-119-accessible-form-errors.md', import.meta.url),
  'utf8',
)

describe('ISSUE-119 accessible required fields and error recovery', () => {
  it('identifies required onboarding inputs without disabling discovery', () => {
    expect(onboardingSource).toMatch(/htmlFor="child-name"[\s\S]+必須/)
    expect(onboardingSource).toMatch(/id="child-name"[\s\S]+required/)
    expect(onboardingSource).toMatch(/id="child-birthdate"[\s\S]+required/)
    expect(onboardingSource).toContain('<span aria-hidden="true"')
    expect(onboardingSource).toContain('disabled={pending}')
    expect(onboardingSource).not.toContain('disabled={!canSubmit}')
  })

  it('associates onboarding errors and restores focus in visual order', () => {
    expect(onboardingSource).toContain('aria-invalid={fieldErrors.name ? true : undefined}')
    expect(onboardingSource).toContain("'child-name-error'")
    expect(onboardingSource).toContain("'child-birthdate-error'")
    expect(onboardingSource).toContain('ref={onboardingErrorSummaryRef}')
    expect(onboardingSource).toContain("fieldOrder: ['name', 'birthdate']")
    expect(onboardingSource).toContain('focusFirstFormError')
    expect(onboardingSource).toContain('noValidate')
  })

  it('associates record errors and opens folded fields before focus', () => {
    expect(recordSource).toMatch(/htmlFor="memory-photo"[\s\S]+必須/)
    expect(recordSource).toMatch(/id="memory-title"[\s\S]+required/)
    expect(recordSource).toMatch(/id="memory-date"[\s\S]+required/)
    expect(recordSource).toContain('id="memory-photo-requirement"')
    expect(recordSource).toContain("'memory-photo-requirement record-footer-status'")
    expect(recordSource).toContain('grid-cols-1 gap-4 min-[360px]:grid-cols-2')
    expect(inputSource).toContain('focus:outline focus:outline-2')
    expect(inputSource).not.toContain('outline-none')
    expect(globalStylesSource).toContain("[data-slot='input']:focus")
    expect(globalStylesSource).toContain('outline: 2px solid var(--ring)')
    expect(recordSource).toContain('id="memory-photo-error"')
    expect(recordSource).toContain('id="memory-title-error"')
    expect(recordSource).toContain('id="memory-body-error"')
    expect(recordSource).toContain('id="memory-date-error"')
    expect(recordSource).toContain('secondaryEditsRef.current.open = true')
    expect(recordSource).toContain("fieldOrder: ['imageIds', 'title', 'body', 'recordedAt']")
    expect(recordSource).toContain('ref={recordErrorSummaryRef}')
    expect(recordSource).toContain("err.reason === 'image_not_found'")
    expect(recordSource).toContain('写真を もういちど 選んでください。')
    expect(recordSource).toContain('disabled={submitting}')
    expect(recordSource).toContain('primaryActionButtonRef.current?.focus()')
    expect(recordSource).toContain('noValidate')
  })

  it('records the WCAG and responsive manual QA gate without sensitive evidence', () => {
    expect(qaSource).toContain('WCAG 2.4.3')
    expect(qaSource).toContain('WCAG 3.3.1')
    expect(qaSource).toContain('WCAG 3.3.2')
    expect(qaSource).toContain('320 CSS px')
    expect(qaSource).toContain('200%')
    expect(qaSource).toContain('実写真、実名、メール、生年月日')
    expect(issueSource).toContain('github_issue: 254')
    expect(issueSource).toContain('Accessibility / Product UX / Frontend Reliability')
  })
})
