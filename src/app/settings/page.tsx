'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AppShell, PageHeader } from '@/components/product/app-shell'
import { DataRow, StatePanel, TrustSection } from '@/components/product/surfaces'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'
import { useChildrenQuery } from '@/features/children/client/use-children'
import { useCurrentUserQuery } from '@/features/me/client/use-current-user'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const meQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const authError = meQuery.error ?? childrenQuery.error
  const isUnauthorized = isApiProblemError(authError) && authError.reason === 'unauthorized'

  useEffect(() => {
    if (isUnauthorized) {
      router.push('/sign-in')
    }
  }, [isUnauthorized, router])

  async function onSignOut() {
    setSigningOut(true)
    try {
      await fetch('/sign-out', { method: 'POST' })
    } catch {
      // ignore: even on failure, push to /sign-in
    }
    queryClient.clear()
    imageUrlCache.clearAll()
    router.push('/sign-in')
  }

  if (isUnauthorized || meQuery.isPending || childrenQuery.isPending) {
    return (
      <AppShell>
        <p role="status" className="text-ink-tertiary text-center text-sm">
          {quietStateCopy.common.loading}
        </p>
      </AppShell>
    )
  }

  if (meQuery.isError || childrenQuery.isError) {
    return (
      <AppShell>
        <StatePanel>
          <h1 className="font-serif text-xl">{quietStateCopy.common.openFailedTitle}</h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            {quietStateCopy.common.openFailedDescription}
          </p>
          <Button onClick={() => location.reload()} className="mt-6 w-full">
            {quietStateCopy.common.retryOpen}
          </Button>
        </StatePanel>
      </AppShell>
    )
  }

  const me = meQuery.data
  const child = childrenQuery.data.data[0] ?? null
  const ageLabel = child
    ? formatAgeLabel(computeAge(new Date(`${child.birthdate}T00:00:00Z`), new Date()))
    : null

  return (
    <AppShell>
      <PageHeader
        eyebrow={settingsTrustCenterCopy.page.eyebrow}
        title={settingsTrustCenterCopy.page.title}
        description={settingsTrustCenterCopy.page.description}
      />

      <section className="flex flex-col gap-5" aria-label="Hana の設定">
        <TrustSection
          eyebrow={settingsTrustCenterCopy.current.eyebrow}
          title={
            child
              ? settingsTrustCenterCopy.current.childRegisteredTitle(child.name)
              : settingsTrustCenterCopy.current.emptyTitle
          }
          description={settingsTrustCenterCopy.current.description}
        >
          {child ? (
            <>
              <DataRow label={settingsTrustCenterCopy.current.childLabel} value={child.name} />
              {ageLabel ? (
                <DataRow label={settingsTrustCenterCopy.current.ageLabel} value={ageLabel} />
              ) : null}
            </>
          ) : (
            <DataRow
              label={settingsTrustCenterCopy.current.childLabel}
              value={settingsTrustCenterCopy.current.missingChild}
            />
          )}
          {me ? (
            <DataRow
              label={settingsTrustCenterCopy.current.accountLabel}
              value={settingsTrustCenterCopy.current.accountValue(me.email)}
            />
          ) : null}
        </TrustSection>

        {me ? (
          <TrustSection
            eyebrow={settingsTrustCenterCopy.ai.eyebrow}
            title={
              me.ai_consent_at
                ? settingsTrustCenterCopy.ai.enabledTitle
                : settingsTrustCenterCopy.ai.disabledTitle
            }
            description={settingsTrustCenterCopy.ai.description}
          >
            <DataRow
              label={settingsTrustCenterCopy.ai.sentLabel}
              value={settingsTrustCenterCopy.ai.sentValue}
            />
            <DataRow
              label={settingsTrustCenterCopy.ai.notSentLabel}
              value={settingsTrustCenterCopy.ai.notSentValue}
            />
            <DataRow
              label={settingsTrustCenterCopy.ai.choiceLabel}
              value={settingsTrustCenterCopy.ai.choiceValue}
            />
            <DataRow
              label={settingsTrustCenterCopy.ai.handlingLabel}
              value={settingsTrustCenterCopy.ai.handlingValue}
            />
          </TrustSection>
        ) : null}

        <TrustSection
          eyebrow={settingsTrustCenterCopy.data.eyebrow}
          title={settingsTrustCenterCopy.data.title}
          description={settingsTrustCenterCopy.data.description}
        >
          <DataRow
            label={settingsTrustCenterCopy.data.memoryDeleteLabel}
            value={settingsTrustCenterCopy.data.memoryDeleteValue}
          />
          <DataRow
            label={settingsTrustCenterCopy.data.evidenceLabel}
            value={settingsTrustCenterCopy.data.evidenceValue}
          />
        </TrustSection>

        <TrustSection
          eyebrow={settingsTrustCenterCopy.future.eyebrow}
          title={settingsTrustCenterCopy.future.title}
          description={settingsTrustCenterCopy.future.description}
        >
          {settingsTrustCenterCopy.future.items.map((item) => (
            <DataRow key={item} label={item} value={settingsTrustCenterCopy.future.unavailable} />
          ))}
        </TrustSection>

        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onSignOut}
            disabled={signingOut}
            className="text-ink-secondary w-full"
          >
            {signingOut ? 'サインアウト しています…' : 'サインアウト'}
          </Button>
        </div>
      </section>
    </AppShell>
  )
}
