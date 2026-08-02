'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { ChevronLeft, CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccessibleDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  memoriesQueryKey,
  type MemoryUpdateRequest,
  useUpdateMemoryMutation,
} from '@/features/memories/client/use-memories'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { signInPath } from '@/lib/auth/safe-redirect'
import { optimisticUpdateMemoryInLists } from '@/lib/perf/optimistic'
import { focusFirstFormError } from '@/lib/ui/form-error-focus'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

const TITLE_MAX = 100
const BODY_MAX = 1000
const WEATHER_MAX = 20

type FieldName = 'title' | 'body' | 'weather'
type FieldErrors = Partial<Record<FieldName, string>>

const fieldOrder: readonly FieldName[] = ['title', 'body', 'weather']

const fieldErrorCopy = {
  titleRequired: 'タイトルを 入れてください。',
  titleTooLong: `タイトルは ${TITLE_MAX}文字までで 入れてください。`,
  bodyTooLong: `本文は ${BODY_MAX}文字までで 入れてください。`,
  weatherTooLong: `天気は ${WEATHER_MAX}文字までで 入れてください。`,
} as const

function extractFieldErrors(problem: ProblemDetails): FieldErrors {
  const errors: FieldErrors = {}
  for (const error of problem.errors ?? []) {
    if (error.path === 'body.title') {
      errors.title =
        error.reason === 'too_long' ? fieldErrorCopy.titleTooLong : fieldErrorCopy.titleRequired
    } else if (error.path === 'body.body') {
      errors.body = fieldErrorCopy.bodyTooLong
    } else if (error.path === 'body.weather') {
      errors.weather = fieldErrorCopy.weatherTooLong
    }
  }
  return errors
}

interface Props {
  memoryId: string
  initialUpdatedAt: string
  initialTitle: string
  initialBody: string | null
  initialWeather: string | null
}

export function MemoryEditForm({
  memoryId,
  initialUpdatedAt,
  initialTitle,
  initialBody,
  initialWeather,
}: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const updateMemoryMutation = useUpdateMemoryMutation()
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody ?? '')
  const [weather, setWeather] = useState(initialWeather ?? '')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [hasConflict, setHasConflict] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const weatherRef = useRef<HTMLInputElement>(null)
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const errorFocusRequestedRef = useRef(false)
  const submitInFlightRef = useRef(false)
  const navigationAllowedRef = useRef(false)
  const detailPath = `/memory/${encodeURIComponent(memoryId)}`
  const normalizedInitialBody = initialBody?.length ? initialBody : null
  const normalizedInitialWeather = initialWeather?.length ? initialWeather : null

  useEffect(() => {
    if (!errorFocusRequestedRef.current) return
    errorFocusRequestedRef.current = false
    focusFirstFormError({
      errors: fieldErrors,
      fieldOrder,
      fieldTargets: {
        title: titleRef.current,
        body: bodyRef.current,
        weather: weatherRef.current,
      },
      fallbackTarget: errorSummaryRef.current,
    })
  }, [fieldErrors, submitMessage])

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setSubmitMessage(null)
    setHasConflict(false)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitInFlightRef.current) return

    setFieldErrors({})
    setSubmitMessage(null)

    const trimmedTitle = title.trim()
    const clientErrors: FieldErrors = {}
    if (!trimmedTitle) clientErrors.title = fieldErrorCopy.titleRequired
    else if (trimmedTitle.length > TITLE_MAX) clientErrors.title = fieldErrorCopy.titleTooLong
    if (body.length > BODY_MAX) clientErrors.body = fieldErrorCopy.bodyTooLong
    if (weather.length > WEATHER_MAX) clientErrors.weather = fieldErrorCopy.weatherTooLong

    if (Object.keys(clientErrors).length > 0) {
      errorFocusRequestedRef.current = true
      setFieldErrors(clientErrors)
      return
    }

    const nextBody = body.length === 0 ? null : body
    const nextWeather = weather.length === 0 ? null : weather
    const patch: MemoryUpdateRequest = { expected_updated_at: initialUpdatedAt }
    if (trimmedTitle !== initialTitle) patch.title = trimmedTitle
    if (nextBody !== normalizedInitialBody) patch.body = nextBody
    if (nextWeather !== normalizedInitialWeather) patch.weather = nextWeather
    if (Object.keys(patch).length === 1) return

    submitInFlightRef.current = true
    try {
      const updated = await updateMemoryMutation.mutateAsync({
        memoryId,
        body: patch,
      })
      optimisticUpdateMemoryInLists(queryClient, memoryId, (memory) => ({
        ...memory,
        title: updated.title,
        body: updated.body,
        weather: updated.weather,
        updated_at: updated.updated_at,
      }))
      navigationAllowedRef.current = true
      router.replace(`${detailPath}?updated=1`)
      router.refresh()
    } catch (error) {
      errorFocusRequestedRef.current = true
      if (isApiProblemError(error)) {
        if (error.reason === 'unauthorized') {
          router.push(signInPath(`${window.location.pathname}${window.location.search}`))
          return
        }
        if (error.reason === 'validation_error') {
          const nextErrors = extractFieldErrors(error.problem)
          if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors)
          } else {
            setSubmitMessage(quietStateCopy.memoryEdit.validationFailed)
          }
        } else if (error.reason === 'not_found') {
          void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
          setSubmitMessage(quietStateCopy.memoryEdit.unavailable)
        } else if (error.reason === 'memory_update_conflict') {
          setHasConflict(true)
          setSubmitMessage(
            '別の画面で、この記録が更新されました。入力はそのままです。最新の内容を確認して、もう一度整えられます。',
          )
        } else {
          setSubmitMessage(quietStateCopy.memoryEdit.saveFailed)
        }
      } else {
        setSubmitMessage(quietStateCopy.memoryEdit.networkFailed)
      }
    } finally {
      submitInFlightRef.current = false
    }
  }

  const pending = updateMemoryMutation.isPending
  const normalizedBody = body.length === 0 ? null : body
  const normalizedWeather = weather.length === 0 ? null : weather
  const hasChanges =
    title.trim() !== initialTitle ||
    normalizedBody !== normalizedInitialBody ||
    normalizedWeather !== normalizedInitialWeather
  const hasErrors = Object.keys(fieldErrors).length > 0
  const summaryMessage =
    submitMessage ?? (hasErrors ? quietStateCopy.memoryEdit.validationFailed : null)

  useEffect(() => {
    if (!hasChanges) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAllowedRef.current) return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasChanges])

  function requestLeave() {
    if (!hasChanges) {
      router.replace(detailPath)
      return
    }
    setLeaveDialogOpen(true)
  }

  function discardChangesAndLeave() {
    navigationAllowedRef.current = true
    setLeaveDialogOpen(false)
    router.replace(detailPath)
  }

  return (
    <>
      <header className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="記録へ もどる"
          disabled={pending}
          onClick={requestLeave}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div>
          <p className="meta-label">ページを整える</p>
          <h1 className="text-ink mt-1 font-serif text-2xl">ことばと天気を なおす</h1>
        </div>
      </header>

      <p className="text-ink-secondary leading-narrative mt-5 px-1 text-sm">
        写真と日付はそのままに、あとから読み返したいことばへ整えられます。
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? quietStateCopy.memoryEdit.pending : ''}
      </p>
      <form className="mt-8 space-y-7" onSubmit={onSubmit} noValidate aria-busy={pending}>
        {summaryMessage ? (
          <div
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
            className="border-amber bg-amber/15 text-ink rounded-[var(--radius-paper-slip)] border-2 px-4 py-4 shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <span className="bg-amber flex size-8 shrink-0 items-center justify-center rounded-full text-white">
                <CircleAlert aria-hidden="true" className="size-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-amber text-base font-bold">
                  {hasErrors ? '入力内容を確認してください' : '保存できませんでした'}
                </p>
                <p className="mt-1 text-sm leading-narrative">{summaryMessage}</p>
              </div>
            </div>
          </div>
        ) : null}
        {hasConflict ? (
          <Button
            type="button"
            size="lg"
            className="w-full font-semibold shadow-lift"
            onClick={() => router.refresh()}
          >
            <RefreshCw aria-hidden="true" className="size-5" />
            最新の内容を確認する
          </Button>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <Label htmlFor="memory-edit-title">
              タイトル
              <span className="text-ink-tertiary text-xs font-normal">必須</span>
            </Label>
            <span className="text-ink-tertiary text-xs" aria-hidden="true">
              {title.length} / {TITLE_MAX}
            </span>
          </div>
          <Input
            ref={titleRef}
            id="memory-edit-title"
            name="title"
            value={title}
            maxLength={TITLE_MAX}
            required
            readOnly={pending}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? 'memory-edit-title-error' : undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              clearFieldError('title')
            }}
          />
          {fieldErrors.title ? (
            <p id="memory-edit-title-error" className="text-amber text-sm">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <Label htmlFor="memory-edit-body">本文</Label>
            <span className="text-ink-tertiary text-xs" aria-hidden="true">
              {body.length} / {BODY_MAX}
            </span>
          </div>
          <Textarea
            ref={bodyRef}
            id="memory-edit-body"
            name="body"
            value={body}
            maxLength={BODY_MAX}
            rows={8}
            readOnly={pending}
            aria-invalid={Boolean(fieldErrors.body)}
            aria-describedby={
              fieldErrors.body
                ? 'memory-edit-body-help memory-edit-body-error'
                : 'memory-edit-body-help'
            }
            onChange={(event) => {
              setBody(event.target.value)
              clearFieldError('body')
            }}
          />
          <p id="memory-edit-body-help" className="text-ink-tertiary text-xs leading-narrative">
            空欄のままでも保存できます。
          </p>
          {fieldErrors.body ? (
            <p id="memory-edit-body-error" className="text-amber text-sm">
              {fieldErrors.body}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <Label htmlFor="memory-edit-weather">天気</Label>
            <span className="text-ink-tertiary text-xs" aria-hidden="true">
              {weather.length} / {WEATHER_MAX}
            </span>
          </div>
          <Input
            ref={weatherRef}
            id="memory-edit-weather"
            name="weather"
            value={weather}
            maxLength={WEATHER_MAX}
            autoComplete="off"
            readOnly={pending}
            aria-invalid={Boolean(fieldErrors.weather)}
            aria-describedby={
              fieldErrors.weather
                ? 'memory-edit-weather-help memory-edit-weather-error'
                : 'memory-edit-weather-help'
            }
            onChange={(event) => {
              setWeather(event.target.value)
              clearFieldError('weather')
            }}
          />
          <p id="memory-edit-weather-help" className="text-ink-tertiary text-xs leading-narrative">
            「はれ」「くもり」など、あとで思い出せる短いことばを残せます。
          </p>
          {fieldErrors.weather ? (
            <p id="memory-edit-weather-error" className="text-amber text-sm">
              {fieldErrors.weather}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button type="submit" size="lg" className="w-full" disabled={pending || !hasChanges}>
            {pending ? quietStateCopy.memoryEdit.pending : 'この内容で なおす'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={requestLeave}
          >
            変更せず もどる
          </Button>
        </div>
      </form>
      {leaveDialogOpen ? (
        <AccessibleDialog
          titleId="memory-edit-leave-title"
          descriptionId="memory-edit-leave-description"
          initialFocusId="memory-edit-leave-continue"
          onClose={() => setLeaveDialogOpen(false)}
        >
          <div className="bg-paper-slip w-full max-w-md rounded-[var(--radius-paper-card)] border border-hairline p-6 shadow-lift">
            <h2 id="memory-edit-leave-title" className="text-ink font-serif text-xl">
              変更を破棄しますか？
            </h2>
            <p
              id="memory-edit-leave-description"
              className="text-ink-secondary mt-3 text-sm leading-narrative"
            >
              まだ保存していない変更があります。編集を続けると、入力した内容はそのまま残ります。
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Button
                id="memory-edit-leave-continue"
                type="button"
                size="lg"
                className="w-full"
                onClick={() => setLeaveDialogOpen(false)}
              >
                編集を続ける
              </Button>
              <Button
                id="memory-edit-leave-discard"
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={discardChangesAndLeave}
              >
                変更を破棄する
              </Button>
            </div>
          </div>
        </AccessibleDialog>
      ) : null}
    </>
  )
}
