'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, PenLine, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FocusedShell } from '@/components/product/app-shell'
import { QuietIcon } from '@/components/product/icons'
import { StatePanel } from '@/components/product/surfaces'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { useChildrenQuery, useCreateChildMutation } from '@/features/children/client/use-children'
import { focusFirstFormError } from '@/lib/ui/form-error-focus'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'
import { signInPath } from '@/lib/auth/safe-redirect'

type FieldErrors = Partial<Record<'name' | 'birthdate' | 'avatar_url', string>>
type Phase = 'loading' | 'form' | 'already' | 'success' | 'error'
type PhaseOverride = 'idle' | 'already' | 'success'

const onboardingFieldErrorCopy = {
  name: '呼び名を 入れてください。',
  birthdate: 'うまれたひを 入れてください。',
  birthdateFuture: 'うまれたひは、きょうまでの日を 選んでください。',
  avatar_url: '写真を たしかめてください。',
} as const

const FIRST_MEMORY_PANEL_SHELL_CLASS =
  'items-stretch justify-start px-0 py-0 sm:items-center sm:justify-center sm:px-6 sm:py-12'
const FIRST_MEMORY_PANEL_CONTENT_CLASS = 'max-w-none sm:max-w-md'
const FIRST_MEMORY_PANEL_CLASS =
  'flex min-h-dvh flex-col rounded-none px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-14 text-center sm:min-h-0 sm:rounded-[var(--radius)] sm:py-8'
const FIRST_MEMORY_ACTIONS_CLASS = 'mt-auto flex flex-col gap-3 pt-10 sm:mt-6 sm:pt-0'

interface RegisteredChild {
  name: string
}

function extractFieldErrors(problem: ProblemDetails): FieldErrors {
  const fields: FieldErrors = {}
  for (const err of problem.errors ?? []) {
    if (err.path === 'body.name') fields.name = onboardingFieldErrorCopy.name
    else if (err.path === 'body.birthdate') fields.birthdate = onboardingFieldErrorCopy.birthdate
    else if (err.path === 'body.avatar_url') fields.avatar_url = onboardingFieldErrorCopy.avatar_url
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
  const nameInputRef = useRef<HTMLInputElement>(null)
  const birthdateInputRef = useRef<HTMLInputElement>(null)
  const onboardingErrorSummaryRef = useRef<HTMLDivElement>(null)
  const errorFocusRequestedRef = useRef(false)
  const submitInFlightRef = useRef(false)
  const successHeadingRef = useRef<HTMLHeadingElement>(null)
  const alreadyHeadingRef = useRef<HTMLHeadingElement>(null)
  const childrenQuery = useChildrenQuery()
  const createChildMutation = useCreateChildMutation()

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const pending = createChildMutation.isPending
  const hasFieldErrors = Object.keys(fieldErrors).length > 0
  const formErrorMessage =
    submitMessage ?? (hasFieldErrors ? quietStateCopy.onboarding.validationFailed : null)
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
      router.push(signInPath(`${window.location.pathname}${window.location.search}`))
    }
  }, [isUnauthorized, router])

  useEffect(() => {
    if (phase === 'success') {
      successHeadingRef.current?.focus()
    } else if (phase === 'already' && phaseOverride === 'already') {
      alreadyHeadingRef.current?.focus()
    }
  }, [phase, phaseOverride])

  useEffect(() => {
    if (!errorFocusRequestedRef.current) return
    errorFocusRequestedRef.current = false
    focusFirstFormError({
      errors: fieldErrors,
      fieldOrder: ['name', 'birthdate'],
      fieldTargets: {
        name: nameInputRef.current,
        birthdate: birthdateInputRef.current,
      },
      fallbackTarget: onboardingErrorSummaryRef.current,
    })
  }, [fieldErrors, submitMessage])

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitInFlightRef.current) return
    setFieldErrors({})
    setSubmitMessage(null)

    const trimmedName = name.trim()
    const clientErrors: FieldErrors = {}
    if (!trimmedName) clientErrors.name = onboardingFieldErrorCopy.name
    if (!birthdate) clientErrors.birthdate = onboardingFieldErrorCopy.birthdate
    else if (birthdate > todayIso) {
      clientErrors.birthdate = onboardingFieldErrorCopy.birthdateFuture
    }
    if (Object.keys(clientErrors).length > 0) {
      errorFocusRequestedRef.current = true
      setFieldErrors(clientErrors)
      return
    }

    submitInFlightRef.current = true
    try {
      await createChildMutation.mutateAsync({ name: trimmedName, birthdate, avatar_url: null })
      setExistingChild({ name: trimmedName })
      setPhaseOverride('success')
    } catch (e) {
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'validation_error':
            {
              const nextFieldErrors = extractFieldErrors(e.problem)
              if (Object.keys(nextFieldErrors).length > 0) {
                errorFocusRequestedRef.current = true
                setFieldErrors(nextFieldErrors)
              } else {
                errorFocusRequestedRef.current = true
                setSubmitMessage(quietStateCopy.onboarding.validationFailed)
              }
            }
            break
          case 'child_limit_reached':
            // 別タブで登録した等の race。可能なら最新の登録済み child で再描画する。
            {
              const refreshed = await childrenQuery.refetch()
              const refreshedChild = refreshed.data?.data[0]
              setExistingChild({ name: refreshedChild?.name ?? trimmedName })
            }
            setPhaseOverride('already')
            return
          case 'unauthorized':
            router.push(signInPath(`${window.location.pathname}${window.location.search}`))
            return
          default:
            errorFocusRequestedRef.current = true
            setSubmitMessage(quietStateCopy.onboarding.saveFailed)
        }
      } else {
        errorFocusRequestedRef.current = true
        setSubmitMessage(quietStateCopy.onboarding.networkFailed)
      }
    } finally {
      submitInFlightRef.current = false
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
        <StatePanel role="alert" aria-labelledby="onboarding-error-title">
          <h1 id="onboarding-error-title" className="font-serif text-xl">
            {quietStateCopy.common.openFailedTitle}
          </h1>
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
      <FocusedShell
        className={FIRST_MEMORY_PANEL_SHELL_CLASS}
        contentClassName={FIRST_MEMORY_PANEL_CONTENT_CLASS}
      >
        <StatePanel
          className={FIRST_MEMORY_PANEL_CLASS}
          aria-labelledby="onboarding-already-title"
          aria-describedby="onboarding-already-description"
        >
          <p role="status" aria-live="polite" className="sr-only">
            すでに登録されています。写真からページをつくるボタンへ進めます。
          </p>
          <div>
            <p className="meta-label">登録済み</p>
            <h1
              id="onboarding-already-title"
              ref={alreadyHeadingRef}
              tabIndex={-1}
              className="mt-2 font-serif text-2xl leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {displayedChild.name} ちゃんのページは
              <br />
              すでにあります
            </h1>
            <p
              id="onboarding-already-description"
              className="text-ink-secondary mt-3 text-sm leading-narrative"
            >
              ここから、写真を 1 まい選んで記録を残せます。
            </p>
          </div>
          <div className={FIRST_MEMORY_ACTIONS_CLASS} data-testid="onboarding-first-memory-actions">
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
      <FocusedShell
        className={FIRST_MEMORY_PANEL_SHELL_CLASS}
        contentClassName={FIRST_MEMORY_PANEL_CONTENT_CLASS}
      >
        <StatePanel
          className={FIRST_MEMORY_PANEL_CLASS}
          aria-labelledby="onboarding-success-title"
          aria-describedby="onboarding-success-description"
        >
          <p role="status" aria-live="polite" className="sr-only">
            登録が完了しました。はじめてのページをつくるボタンへ進めます。
          </p>
          <div>
            <p className="meta-label">はじめまして</p>
            <h1
              id="onboarding-success-title"
              ref={successHeadingRef}
              tabIndex={-1}
              className="mt-2 font-serif text-2xl leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {displayedChild.name} ちゃんの
              <br />
              最初のページをつくれます
            </h1>
            <p
              id="onboarding-success-description"
              className="text-ink-secondary mt-3 text-sm leading-narrative"
            >
              ありのままの写真 1 まいから、静かに残しましょう。
            </p>
          </div>
          <div className={FIRST_MEMORY_ACTIONS_CLASS} data-testid="onboarding-first-memory-actions">
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

        <section
          className="border-hairline mt-7 flex flex-col gap-4 border-y py-5"
          data-testid="onboarding-trust-bridge"
          aria-labelledby="onboarding-trust-title"
        >
          <h2 id="onboarding-trust-title" className="sr-only">
            登録前に確認できること
          </h2>
          <ul className="flex flex-col gap-4">
            <li className="flex gap-3">
              <QuietIcon icon={PenLine} tone="primary" />
              <p className="text-ink-secondary text-sm leading-narrative">
                呼び名は、記録の見出しや下書きで呼ぶために使います。
              </p>
            </li>
            <li className="flex gap-3">
              <QuietIcon icon={CalendarDays} tone="muted" />
              <p className="text-ink-secondary text-sm leading-narrative">
                うまれたひは月齢の表示に使います。AI
                に使う場合も、たんじょうびそのものではなく月齢として扱います。
              </p>
            </li>
            <li className="flex gap-3">
              <QuietIcon icon={ShieldCheck} tone="muted" />
              <p className="text-ink-secondary text-sm leading-narrative">
                この登録だけでは、写真や記録は作成されません。
              </p>
            </li>
          </ul>
        </section>

        {formErrorMessage ? (
          <div
            ref={onboardingErrorSummaryRef}
            id="onboarding-validation-alert"
            role="alert"
            tabIndex={-1}
            className="text-ink-secondary mt-6 rounded-xl bg-warm px-4 py-3 text-sm leading-narrative"
          >
            {formErrorMessage}
          </div>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="child-name" className="font-serif">
              呼び名{' '}
              <span aria-hidden="true" className="text-amber font-sans text-xs">
                必須
              </span>
            </Label>
            <Input
              ref={nameInputRef}
              id="child-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                clearFieldError('name')
              }}
              placeholder="はな"
              maxLength={50}
              autoComplete="off"
              required
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
              うまれたひ{' '}
              <span aria-hidden="true" className="text-amber font-sans text-xs">
                必須
              </span>
            </Label>
            <Input
              ref={birthdateInputRef}
              id="child-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => {
                setBirthdate(e.target.value)
                clearFieldError('birthdate')
              }}
              max={todayIso}
              required
              aria-invalid={fieldErrors.birthdate ? true : undefined}
              aria-describedby={fieldErrors.birthdate ? 'child-birthdate-error' : undefined}
            />
            {fieldErrors.birthdate ? (
              <p id="child-birthdate-error" className="text-amber text-xs">
                {fieldErrors.birthdate}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? quietStateCopy.onboarding.pending : 'つづける'}
          </Button>
        </form>
      </StatePanel>
    </FocusedShell>
  )
}
