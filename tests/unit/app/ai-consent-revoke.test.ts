import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'

const openApiSource = readFileSync(
  new URL('../../../docs/openapi/openapi.yaml', import.meta.url),
  'utf8',
)
const routeSource = readFileSync(
  new URL('../../../src/app/v1/me/ai-consent/route.ts', import.meta.url),
  'utf8',
)
const hookSource = readFileSync(
  new URL('../../../src/features/me/client/use-current-user.ts', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const dialogSource = readFileSync(
  new URL('../../../src/components/ui/dialog.tsx', import.meta.url),
  'utf8',
)
const aiGenerateSource = readFileSync(
  new URL('../../../src/app/v1/ai/generate/route.ts', import.meta.url),
  'utf8',
)
const memoriesSource = readFileSync(
  new URL('../../../src/app/v1/memories/route.ts', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-118-ai-consent-revoke.md', import.meta.url),
  'utf8',
)

describe('ISSUE-118 AI consent revocation', () => {
  it('defines and consumes an authenticated idempotent DELETE contract', () => {
    expect(openApiSource).toContain('operationId: revokeAiConsent')
    expect(openApiSource).toContain('既に未同意でも 200 を返す')
    expect(routeSource).toContain('export async function DELETE()')
    expect(routeSource).toContain('where: { id: user.id }')
    expect(routeSource).toContain('where: { id: user.id, aiConsentAt: null }')
    expect(routeSource).not.toMatch(/request\.json|userId:\s*input/)
    expect(hookSource).toContain("DELETE('/me/ai-consent')")
    expect(hookSource).toContain('if (currentUser.ai_consent_at === null) return currentUser')
    expect(hookSource).toContain("scope: { id: 'ai-consent' }")
    expect(hookSource).toContain('queryClient.cancelQueries')
    expect(hookSource).toContain('queryClient.invalidateQueries')
    expect(hookSource).toContain("GET('/me', { signal })")
    expect(hookSource).toContain('queryClient.setQueryData(currentUserQueryKey, user)')
  })

  it('explains the exact prospective boundary before revocation', () => {
    expect(settingsTrustCenterCopy.ai.revokeDialogDescription).toContain('もう一度同意が必要')
    expect(settingsTrustCenterCopy.ai.revokeDialogDescription).toContain(
      'AIを使わずに記録を残すことは続けられます',
    )
    expect(settingsTrustCenterCopy.ai.revokeDialogDescription).toContain(
      '過去にAIへ送信したデータの個別削除を行う手続きではありません',
    )
    expect(settingsTrustCenterCopy.ai.revokeDialogDescription).toContain(
      '撤回前に開始したAI生成は完了する場合があります',
    )
    expect(settingsTrustCenterCopy.ai.revokeDialogDescription).not.toContain('完全に削除')
    expect(settingsSource).toContain('me.ai_consent_at ?')
    expect(settingsSource).toContain('settingsTrustCenterCopy.ai.revokeDialogDescription')
  })

  it('uses the shared dialog focus, Escape, reading and pending contracts', () => {
    expect(settingsSource).toContain('titleId="ai-consent-revoke-title"')
    expect(settingsSource).toContain('descriptionId="ai-consent-revoke-description"')
    expect(settingsSource).toContain('initialFocusId="ai-consent-revoke-cancel"')
    expect(settingsSource).toContain('id="ai-consent-revoke-cancel"')
    expect(settingsSource).toContain('pending={revokeAiConsentMutation.isPending}')
    expect(settingsSource).toContain('const revokeInFlightRef = useRef(false)')
    expect(settingsSource).toContain('if (revokeInFlightRef.current) return')
    expect(settingsSource).toContain('aria-disabled={revokeAiConsentMutation.isPending}')
    expect(settingsSource).not.toMatch(/\sdisabled=\{revokeAiConsentMutation\.isPending\}/)
    expect(settingsSource).toContain('ref={revokeStatusRef}')
    expect(settingsSource).toContain('revokeStatusRef.current?.focus()')
    expect(settingsSource).toContain('queryClient.getQueryData<CurrentUser>(currentUserQueryKey)')
    expect(settingsSource).toContain('showRevokeSuccess()')
    expect(settingsSource).toContain('role="status" aria-live="polite"')
    expect(settingsSource).toContain('role="alert"')
    expect(settingsSource).toContain('role="status"')
    expect(dialogSource).toContain("event.key === 'Escape'")
    expect(dialogSource).toContain('if (!pending) onClose()')
    expect(dialogSource).toContain('aria-labelledby={titleId}')
    expect(dialogSource).toContain('aria-describedby={descriptionId}')
    expect(dialogSource).toContain('aria-busy={pending}')
  })

  it('keeps AI generation consent-gated without coupling ordinary memory creation to consent', () => {
    expect(aiGenerateSource).toContain('if (!user.aiConsentAt)')
    expect(aiGenerateSource).toContain('throw problems.aiConsentRequired()')
    expect(aiGenerateSource).toContain('const latestConsent = await prisma.profile.findUnique')
    expect(memoriesSource).not.toContain('aiConsentAt')
  })

  it('records the human review and evidence-safety boundary', () => {
    expect(issueSource).toContain('github_issue: 253')
    expect(issueSource).toContain('Privacy / Legal Human Review')
    expect(issueSource).toContain('任意のユーザーIDを受け取らない')
    expect(issueSource).toContain('過去送信の個別削除手続きと誤認させず')
  })
})
