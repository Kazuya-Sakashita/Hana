'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FocusedShell } from '@/components/product/app-shell'
import { StatePanel } from '@/components/product/surfaces'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { useChildrenQuery, useCreateChildMutation } from '@/features/children/client/use-children'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

type FieldErrors = Partial<Record<'name' | 'birthdate' | 'avatar_url', string>>
type Phase = 'loading' | 'form' | 'already' | 'success' | 'error'
type PhaseOverride = 'idle' | 'already' | 'success'

interface RegisteredChild {
  name: string
}

function extractFieldErrors(problem: ProblemDetails): FieldErrors {
  const fields: FieldErrors = {}
  for (const err of problem.errors ?? []) {
    if (err.path === 'body.name') fields.name = err.message
    else if (err.path === 'body.birthdate') fields.birthdate = err.message
    else if (err.path === 'body.avatar_url') fields.avatar_url = err.message
  }
  return fields
}

export default function OnboardingPage() {
  const router = useRouter()

  const [existingChild, setExistingChild] = useState<RegisteredChild | null>(null)
  const [phaseOverride, setPhaseOverride] = useState<PhaseOverride>('idle')
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const childrenQuery = useChildrenQuery()
  const createChildMutation = useCreateChildMutation()

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const pending = createChildMutation.isPending
  const canSubmit = name.trim().length > 0 && birthdate.length > 0 && !pending
  const fetchedChild = childrenQuery.data?.data[0] ?? null
  const displayedChild = existingChild ?? (fetchedChild ? { name: fetchedChild.name } : null)
  const isUnauthorized =
    isApiProblemError(childrenQuery.error) && childrenQuery.error.reason === 'unauthorized'
  const phase: Phase =
    isUnauthorized || childrenQuery.isPending
      ? 'loading'
      : childrenQuery.isError
        ? 'error'
        : phaseOverride === 'success'
          ? 'success'
          : phaseOverride === 'already' || displayedChild
            ? 'already'
            : 'form'

  useEffect(() => {
    if (isUnauthorized) {
      router.push('/sign-in')
    }
  }, [isUnauthorized, router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setSubmitMessage(null)

    const trimmedName = name.trim()
    try {
      await createChildMutation.mutateAsync({ name: trimmedName, birthdate, avatar_url: null })
      setExistingChild({ name: trimmedName })
      setPhaseOverride('success')
    } catch (e) {
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'validation_error':
            setFieldErrors(extractFieldErrors(e.problem))
            break
          case 'child_limit_reached':
            // 別タブで登録した等の race。最新状態で再描画
            setExistingChild({ name: trimmedName })
            setPhaseOverride('already')
            return
          case 'unauthorized':
            router.push('/sign-in')
            return
          default:
            setSubmitMessage(quietStateCopy.onboarding.saveFailed)
        }
      } else {
        setSubmitMessage(quietStateCopy.onboarding.networkFailed)
      }
    }
  }

  if (phase === 'loading') {
    return (
      <FocusedShell>
        <StatePanel>
          <span role="status" className="text-ink-tertiary text-sm">
            {quietStateCopy.common.loading}
          </span>
        </StatePanel>
      </FocusedShell>
    )
  }

  if (phase === 'error') {
    return (
      <FocusedShell>
        <StatePanel>
          <h1 className="font-serif text-xl">{quietStateCopy.common.openFailedTitle}</h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            {quietStateCopy.common.openFailedDescription}
          </p>
          <Button onClick={() => location.reload()} className="mt-6 w-full">
            {quietStateCopy.common.retryOpen}
          </Button>
        </StatePanel>
      </FocusedShell>
    )
  }

  if (phase === 'already' && displayedChild) {
    return (
      <FocusedShell>
        <StatePanel>
          <p className="meta-label">登録済み</p>
          <h1 className="mt-2 font-serif text-2xl leading-snug">
            {displayedChild.name} ちゃんのページは
            <br />
            すでにあります
          </h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            ここから、写真を 1 まい選んで記録を残せます。
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/record" prefetch={false}>
                写真からページをつくる
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link href="/">ホームへ</Link>
            </Button>
          </div>
        </StatePanel>
      </FocusedShell>
    )
  }

  if (phase === 'success' && displayedChild) {
    return (
      <FocusedShell>
        <StatePanel aria-live="polite">
          <p className="meta-label">はじめまして</p>
          <h1 className="mt-2 font-serif text-2xl leading-snug">
            {displayedChild.name} ちゃんの
            <br />
            最初のページをつくれます
          </h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            ありのままの写真 1 まいから、静かに残しましょう。
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/record" prefetch={false}>
                はじめてのページをつくる
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link href="/">ホームへ</Link>
            </Button>
          </div>
        </StatePanel>
      </FocusedShell>
    )
  }

  return (
    <FocusedShell>
      <StatePanel className="text-left">
        <div className="text-center">
          <p className="meta-label">Hana をはじめる</p>
          <h1 className="mt-2 font-serif text-2xl leading-snug">
            お子さんのこと、
            <br />
            おしえてください
          </h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            記録のページで呼ぶ名前と、月齢の表示に使います。
          </p>
        </div>

        {submitMessage ? (
          <div
            role="alert"
            className="text-ink-secondary mt-6 rounded-xl bg-warm px-4 py-3 text-sm leading-narrative"
          >
            {submitMessage}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="child-name" className="font-serif">
              なまえ
            </Label>
            <Input
              id="child-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="はな"
              maxLength={50}
              autoComplete="off"
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? 'child-name-error' : undefined}
            />
            {fieldErrors.name ? (
              <p id="child-name-error" className="text-amber text-xs">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="child-birthdate" className="font-serif">
              うまれたひ
            </Label>
            <Input
              id="child-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={todayIso}
              aria-invalid={fieldErrors.birthdate ? true : undefined}
              aria-describedby={fieldErrors.birthdate ? 'child-birthdate-error' : undefined}
            />
            {fieldErrors.birthdate ? (
              <p id="child-birthdate-error" className="text-amber text-xs">
                {fieldErrors.birthdate}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
            {pending ? quietStateCopy.onboarding.pending : 'つづける'}
          </Button>
        </form>
      </StatePanel>
    </FocusedShell>
  )
}
