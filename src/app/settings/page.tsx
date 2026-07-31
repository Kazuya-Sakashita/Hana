'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Clock3, Database, FileText, ShieldCheck, UserX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AccessibleDialog } from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppShell, PageHeader } from '@/components/product/app-shell'
import { DataRow, StatePanel, TrustSection } from '@/components/product/surfaces'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'
import { recordDraftStore } from '@/features/memories/client/record-draft-store'
import { useChildrenQuery } from '@/features/children/client/use-children'
import { ChildProfileEditForm } from '@/features/children/client/child-profile-edit-form'
import {
  currentUserQueryKey,
  type CurrentUser,
  useCurrentUserQuery,
  useRevokeAiConsentMutation,
} from '@/features/me/client/use-current-user'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'
import { signInPath } from '@/lib/auth/safe-redirect'
import { clearLocalSessionState, signOutAndClear } from '@/features/auth/client/sign-out'

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [deletionDialog, setDeletionDialog] = useState<'explain' | 'confirm' | null>(null)
  const [deletionConfirmation, setDeletionConfirmation] = useState('')
  const [deletionPending, setDeletionPending] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)
  const [deletionInputError, setDeletionInputError] = useState<string | null>(null)
  const deletionIdempotencyKeyRef = useRef<string | null>(null)
  const revokeStatusRef = useRef<HTMLParagraphElement>(null)
  const revokeInFlightRef = useRef(false)
  const meQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const revokeAiConsentMutation = useRevokeAiConsentMutation()
  const authError = meQuery.error ?? childrenQuery.error
  const isUnauthorized = isApiProblemError(authError) && authError.reason === 'unauthorized'

  useEffect(() => {
    if (isUnauthorized) {
      router.push(signInPath(`${window.location.pathname}${window.location.search}`))
    }
  }, [isUnauthorized, router])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('account_deletion') === 'verified') {
      const timeoutId = window.setTimeout(() => setDeletionDialog('confirm'), 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [])

  async function onSignOut() {
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOutAndClear({
        clearLocalState: () =>
          clearLocalSessionState([
            () => queryClient.clear(),
            () => imageUrlCache.clearAll(),
            () => recordDraftStore.clear(),
          ]),
      })
      router.push('/sign-in')
    } catch {
      setSignOutError(
        'サインアウトを完了できませんでした。設定はそのままです。通信が戻ったら、もう一度お試しください。',
      )
      setSigningOut(false)
    }
  }

  async function onRevokeAiConsent() {
    if (revokeInFlightRef.current) return
    revokeInFlightRef.current = true
    setRevokeError(null)
    try {
      await revokeAiConsentMutation.mutateAsync()
      showRevokeSuccess()
    } catch {
      const latestUser = queryClient.getQueryData<CurrentUser>(currentUserQueryKey)
      if (latestUser?.ai_consent_at === null) {
        showRevokeSuccess()
        return
      }
      setRevokeError(settingsTrustCenterCopy.ai.revokeFailed)
    } finally {
      revokeInFlightRef.current = false
    }
  }

  function showRevokeSuccess() {
    setRevokeError(null)
    setRevokeDialogOpen(false)
    setRevokeMessage(settingsTrustCenterCopy.ai.revokeDone)
    window.setTimeout(() => revokeStatusRef.current?.focus(), 0)
  }

  async function startAccountDeletionReauthentication() {
    setDeletionPending(true)
    setDeletionError(null)
    try {
      const response = await fetch('/v1/me/account-deletion-intents', { method: 'POST' })
      if (!response.ok) throw new Error('intent_failed')
      const body = (await response.json()) as { authorization_url?: string }
      if (!body.authorization_url) throw new Error('intent_failed')
      window.location.assign(body.authorization_url)
    } catch {
      setDeletionError(
        '本人確認を開始できませんでした。退会は受け付けていません。少し時間をおいてお試しください。',
      )
      setDeletionPending(false)
    }
  }

  async function confirmAccountDeletion() {
    if (deletionConfirmation !== '退会する') {
      setDeletionInputError('確認のため「退会する」と入力してください。')
      return
    }
    setDeletionPending(true)
    setDeletionError(null)
    setDeletionInputError(null)
    deletionIdempotencyKeyRef.current ??= crypto.randomUUID()
    try {
      const response = await fetch('/v1/me/account-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': deletionIdempotencyKeyRef.current,
        },
        body: JSON.stringify({ confirmation: deletionConfirmation }),
      })
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          setDeletionError(
            '本人確認の有効期限が切れたか、入力を確認できませんでした。設定にもどり、本人確認からやり直してください。',
          )
          setDeletionPending(false)
          return
        }
        throw new Error('deletion_result_unknown')
      }
      finishAccountDeletion()
    } catch {
      setDeletionError('通信が途切れたため、退会の受付結果を確認しています…')
      try {
        const statusResponse = await fetch('/v1/me/account-deletion/status', {
          cache: 'no-store',
        })
        if (statusResponse.ok) {
          finishAccountDeletion()
          return
        }
      } catch {}
      setDeletionError(
        '受付結果を確認できませんでした。通信が戻ったら、同じ内容で「退会を確定する」をもう一度押してください。',
      )
      setDeletionPending(false)
    }
  }

  function finishAccountDeletion() {
    clearLocalSessionState([
      () => queryClient.clear(),
      () => imageUrlCache.clearAll(),
      () => recordDraftStore.clear(),
    ])
    router.replace('/account-closed')
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
          icon={ShieldCheck}
          iconTone="primary"
          data-testid="settings-trust-overview"
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
              <ChildProfileEditForm child={child} />
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

        <TrustSection
          eyebrow={settingsTrustCenterCopy.accountDeletion.eyebrow}
          icon={UserX}
          iconTone="muted"
          data-testid="settings-account-deletion"
          title={settingsTrustCenterCopy.accountDeletion.title}
          description={settingsTrustCenterCopy.accountDeletion.description}
        >
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setDeletionError(null)
              setDeletionDialog('explain')
            }}
          >
            {settingsTrustCenterCopy.accountDeletion.button}
          </Button>
        </TrustSection>

        {me ? (
          <TrustSection
            eyebrow={settingsTrustCenterCopy.ai.eyebrow}
            icon={FileText}
            iconTone="muted"
            data-testid="settings-ai-boundary"
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
            {me.ai_consent_at ? (
              <div className="border-hairline mt-1 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setRevokeError(null)
                    setRevokeMessage(null)
                    setRevokeDialogOpen(true)
                  }}
                >
                  {settingsTrustCenterCopy.ai.revokeButton}
                </Button>
              </div>
            ) : null}
            {revokeMessage ? (
              <p
                ref={revokeStatusRef}
                role="status"
                tabIndex={-1}
                className="text-leaf leading-narrative text-sm outline-none"
              >
                {revokeMessage}
              </p>
            ) : null}
          </TrustSection>
        ) : null}

        <TrustSection
          eyebrow={settingsTrustCenterCopy.data.eyebrow}
          icon={Database}
          iconTone="muted"
          data-testid="settings-data-boundaries"
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
          icon={Clock3}
          iconTone="muted"
          data-testid="settings-future-boundary"
          title={settingsTrustCenterCopy.future.title}
          description={settingsTrustCenterCopy.future.description}
        >
          {settingsTrustCenterCopy.future.items.map((item) => (
            <DataRow key={item} label={item} value={settingsTrustCenterCopy.future.unavailable} />
          ))}
        </TrustSection>

        <div className="pt-2">
          {signOutError ? (
            <p role="alert" className="text-amber mb-3 text-sm leading-narrative">
              {signOutError}
            </p>
          ) : null}
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

      {revokeDialogOpen ? (
        <AccessibleDialog
          titleId="ai-consent-revoke-title"
          descriptionId="ai-consent-revoke-description"
          initialFocusId="ai-consent-revoke-cancel"
          pending={revokeAiConsentMutation.isPending}
          onClose={() => setRevokeDialogOpen(false)}
        >
          <Card className="w-full max-w-md">
            <CardHeader className="items-center text-center">
              <CardTitle id="ai-consent-revoke-title" className="font-serif text-xl">
                {settingsTrustCenterCopy.ai.revokeDialogTitle}
              </CardTitle>
              <CardDescription
                id="ai-consent-revoke-description"
                className="leading-narrative mt-2"
              >
                {settingsTrustCenterCopy.ai.revokeDialogDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {revokeError ? (
                <p role="alert" className="text-amber leading-narrative text-sm">
                  {revokeError}
                </p>
              ) : null}
              <Button
                id="ai-consent-revoke-cancel"
                type="button"
                size="lg"
                onClick={() => {
                  if (!revokeAiConsentMutation.isPending) setRevokeDialogOpen(false)
                }}
                aria-disabled={revokeAiConsentMutation.isPending}
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50 w-full"
              >
                {settingsTrustCenterCopy.ai.revokeCancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={onRevokeAiConsent}
                aria-disabled={revokeAiConsentMutation.isPending}
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50 w-full"
              >
                {revokeAiConsentMutation.isPending ? (
                  <span role="status" aria-live="polite">
                    {settingsTrustCenterCopy.ai.revokePending}
                  </span>
                ) : (
                  settingsTrustCenterCopy.ai.revokeConfirm
                )}
              </Button>
            </CardContent>
          </Card>
        </AccessibleDialog>
      ) : null}

      {deletionDialog === 'explain' ? (
        <AccessibleDialog
          titleId="account-deletion-explain-title"
          descriptionId="account-deletion-explain-description"
          initialFocusId="account-deletion-cancel"
          pending={deletionPending}
          onClose={() => setDeletionDialog(null)}
        >
          <Card className="w-full max-w-md">
            <CardHeader className="items-center text-center">
              <CardTitle id="account-deletion-explain-title" className="font-serif text-xl">
                退会すると、すぐに使えなくなります
              </CardTitle>
              <CardDescription
                id="account-deletion-explain-description"
                className="leading-narrative mt-2"
              >
                退会受付後、Hanaの画面と新しい画像URLからはすぐに開けなくなります。すでに読み込み済みの写真は最大30分見られる場合があります。保存済みの内容を元に戻す機能はありません。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {deletionError ? (
                <p role="alert" className="text-amber text-sm leading-narrative">
                  {deletionError}
                </p>
              ) : null}
              <Button
                id="account-deletion-cancel"
                type="button"
                variant="outline"
                disabled={deletionPending}
                onClick={() => setDeletionDialog(null)}
              >
                設定にもどる
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletionPending}
                onClick={startAccountDeletionReauthentication}
              >
                {deletionPending ? 'Googleで本人確認をしています…' : 'Googleで本人確認する'}
              </Button>
            </CardContent>
          </Card>
        </AccessibleDialog>
      ) : null}

      {deletionDialog === 'confirm' ? (
        <AccessibleDialog
          titleId="account-deletion-confirm-title"
          descriptionId="account-deletion-confirm-description"
          initialFocusId="account-deletion-confirm-cancel"
          pending={deletionPending}
          onClose={() => setDeletionDialog(null)}
        >
          <Card className="w-full max-w-md">
            <CardHeader className="items-center text-center">
              <CardTitle id="account-deletion-confirm-title" className="font-serif text-xl">
                最後の確認です
              </CardTitle>
              <CardDescription
                id="account-deletion-confirm-description"
                className="leading-narrative mt-2"
              >
                退会すると、通常のHana画面と新しい画像URLはすぐに使えなくなります。すでに読み込み済みの写真は最大30分見られる場合があります。この操作を取り消す画面はありません。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <label htmlFor="account-deletion-confirmation" className="text-sm leading-narrative">
                確認のため「退会する」と入力してください
              </label>
              <input
                id="account-deletion-confirmation"
                value={deletionConfirmation}
                disabled={deletionPending}
                aria-invalid={Boolean(deletionInputError)}
                aria-describedby={deletionInputError ? 'account-deletion-input-error' : undefined}
                onChange={(event) => {
                  setDeletionConfirmation(event.target.value)
                  setDeletionInputError(null)
                }}
                className="border-hairline bg-paper min-h-11 rounded-md border px-3 text-base"
              />
              {deletionInputError ? (
                <p
                  id="account-deletion-input-error"
                  role="alert"
                  className="text-amber text-sm leading-narrative"
                >
                  {deletionInputError}
                </p>
              ) : null}
              {deletionError ? (
                <p role="alert" className="text-amber text-sm leading-narrative">
                  {deletionError}
                </p>
              ) : null}
              <Button
                id="account-deletion-confirm-cancel"
                type="button"
                variant="outline"
                disabled={deletionPending}
                onClick={() => setDeletionDialog(null)}
              >
                退会しない
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletionPending || deletionConfirmation !== '退会する'}
                onClick={confirmAccountDeletion}
              >
                {deletionPending ? '退会を受け付けています…' : '退会を確定する'}
              </Button>
            </CardContent>
          </Card>
        </AccessibleDialog>
      ) : null}
    </AppShell>
  )
}
