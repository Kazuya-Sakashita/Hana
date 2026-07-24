'use client'

import NextImage from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AccessibleDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChildrenQuery } from '@/features/children/client/use-children'
import {
  memoriesQueryKey,
  useCreateMemoryMutation,
  type Memory,
  type MemoryCreateRequest,
} from '@/features/memories/client/use-memories'
import { useCurrentUserQuery, useSetAiConsentMutation } from '@/features/me/client/use-current-user'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { optimisticAddMemoryToLists, optimisticReplaceMemoryInLists } from '@/lib/perf/optimistic'
import { useToast } from '@/components/ui/toast'
import { quietStateCopy, recordAiGeneratingCopy } from '@/lib/ui/quiet-state-copy'

type Phase = 'loading' | 'no-child' | 'form' | 'error'
type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'done' | 'failed'
type AiStatus = 'idle' | 'consent_pending' | 'generating' | 'done' | 'failed'

interface UploadedImage {
  id: string
  previewUrl: string
}

interface FieldErrors {
  title?: string
  body?: string
  recordedAt?: string
  imageIds?: string
  general?: string
}

function extractFieldErrors(problem: ProblemDetails): FieldErrors {
  const fields: FieldErrors = {}
  for (const err of problem.errors ?? []) {
    if (err.path === 'body.title') fields.title = err.message
    else if (err.path === 'body.body') fields.body = err.message
    else if (err.path === 'body.recorded_at') fields.recordedAt = err.message
    else if (err.path.startsWith('body.image_ids')) fields.imageIds = err.message
  }
  return fields
}

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'

async function reencodeImage(
  file: File,
): Promise<{ blob: Blob; contentType: AllowedMime; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('画像を よみこめませんでした'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas が つかえません')
    ctx.drawImage(img, 0, 0)
    const outType: AllowedMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('encoded blob is null'))),
        outType,
        0.92,
      )
    })
    return { blob, contentType: outType, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function RecordPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [aiConsentAtOverride, setAiConsentAtOverride] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiQuotaExceeded, setAiQuotaExceeded] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [recordedAt, setRecordedAt] = useState(todayIso)
  const [weather, setWeather] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [topMessage, setTopMessage] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentUserQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const setAiConsentMutation = useSetAiConsentMutation()
  const createMemoryMutation = useCreateMemoryMutation()

  const selectedChild = childrenQuery.data?.data[0] ?? null
  const childId = selectedChild?.id ?? null
  const childName = selectedChild?.name ?? ''
  const aiConsentAt = aiConsentAtOverride ?? currentUserQuery.data?.ai_consent_at ?? null
  const authError = currentUserQuery.error ?? childrenQuery.error
  const isUnauthorized = isApiProblemError(authError) && authError.reason === 'unauthorized'
  const phase: Phase =
    isUnauthorized || currentUserQuery.isPending || childrenQuery.isPending
      ? 'loading'
      : currentUserQuery.isError || childrenQuery.isError
        ? 'error'
        : selectedChild
          ? 'form'
          : 'no-child'
  const canSubmit =
    !!uploadedImage && title.trim().length > 0 && recordedAt.length > 0 && !submitting
  const canGenerateAi = !!uploadedImage && aiStatus !== 'generating' && !aiQuotaExceeded
  const hasSelectedPhoto = !!filePreviewUrl && !!file
  const storyPreview = body.trim()
  const hasUnsavedChanges =
    hasSelectedPhoto || !!uploadedImage || title.trim().length > 0 || storyPreview.length > 0
  const decisionCue = getRecordDecisionCue({
    uploaded: !!uploadedImage,
    aiStatus,
    canSubmit,
    hasStory: storyPreview.length > 0,
  })

  function onCancelClick() {
    if (hasUnsavedChanges) {
      setCancelDialogOpen(true)
    } else {
      router.push('/')
    }
  }

  useEffect(() => {
    if (isUnauthorized) {
      router.push('/sign-in')
    }
  }, [isUnauthorized, router])

  useEffect(() => {
    if (!filePreviewUrl) return
    return () => URL.revokeObjectURL(filePreviewUrl)
  }, [filePreviewUrl])

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0] ?? null
    if (!f) return
    setFile(f)
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    setFilePreviewUrl(URL.createObjectURL(f))
    setUploadStatus('preparing')
    setUploadError(null)
    setUploadedImage(null)
    setAiStatus('idle')
    setAiError(null)

    try {
      const { blob, contentType, width, height } = await reencodeImage(f)
      const client = getBrowserApiClient()
      const presigned = await client.POST('/uploads/presigned-url', {
        body: { file_name: f.name, content_type: contentType },
      })
      if (!presigned.data) throw new Error('upload_prepare_failed')
      const { presigned_url, storage_key } = presigned.data

      setUploadStatus('uploading')
      const putRes = await fetch(presigned_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      })
      if (!putRes.ok) {
        throw new Error('upload_failed')
      }

      setUploadStatus('confirming')
      const confirmed = await client.POST('/uploads/confirm', {
        body: { storage_key, width, height, file_size: blob.size },
      })
      if (!confirmed.data) throw new Error('upload_confirm_failed')

      setUploadedImage({ id: confirmed.data.id, previewUrl: filePreviewUrl ?? '' })
      setUploadStatus('done')
    } catch (e: unknown) {
      setUploadStatus('failed')
      setUploadError(quietStateCopy.record.uploadFailed)
    }
  }

  function resetPhotoInput(event: React.MouseEvent<HTMLInputElement>) {
    event.currentTarget.value = ''
  }

  function openPhotoPicker() {
    fileInputRef.current?.click()
  }

  async function callAiGenerate() {
    if (!uploadedImage || !childId) return
    setAiStatus('generating')
    setAiError(null)
    const client = getBrowserApiClient()
    try {
      const res = await client.POST('/ai/generate', {
        body: {
          child_id: childId,
          image_ids: [uploadedImage.id],
          recorded_at: recordedAt || null,
          weather: weather.trim() === '' ? null : weather,
          parent_note: body.trim() === '' ? null : body,
        },
      })
      if (!res.data) throw new Error('生成結果が からでした')
      setTitle(res.data.title)
      setBody(res.data.body)
      setAiStatus('done')
    } catch (e) {
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'unauthorized':
            router.push('/sign-in')
            return
          case 'ai_consent_required':
            setAiStatus('consent_pending')
            return
          case 'ai_quota_exceeded':
            setAiQuotaExceeded(true)
            setAiStatus('failed')
            setAiError(quietStateCopy.record.aiQuotaExceeded)
            return
          default:
            setAiStatus('failed')
            setAiError(quietStateCopy.record.aiFailed)
        }
      } else {
        setAiStatus('failed')
        setAiError(quietStateCopy.record.aiFailed)
      }
    }
  }

  async function acceptAiConsent() {
    try {
      const user = await setAiConsentMutation.mutateAsync()
      setAiConsentAtOverride(user.ai_consent_at)
      setAiStatus('idle')
      // 同意完了 → 自動で生成リトライ
      void callAiGenerate()
    } catch {
      setAiStatus('failed')
      setAiError(quietStateCopy.record.consentSaveFailed)
    }
  }

  function declineAiConsent() {
    setAiStatus('idle')
  }

  function focusManualTitle() {
    titleInputRef.current?.focus()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uploadedImage || !childId) return
    setSubmitting(true)
    setFieldErrors({})
    setTopMessage(null)

    const trimmedTitle = title.trim()
    const wasAiGenerated = aiStatus === 'done'
    const requestBody: MemoryCreateRequest = {
      child_id: childId,
      title: trimmedTitle,
      body: body.trim() === '' ? null : body,
      recorded_at: recordedAt,
      weather: weather.trim() === '' ? null : weather,
      image_ids: [uploadedImage.id],
      ai_generated: wasAiGenerated,
    }
    const now = new Date().toISOString()
    const optimisticId =
      typeof crypto.randomUUID === 'function'
        ? `optimistic-${crypto.randomUUID()}`
        : `optimistic-${Date.now()}`
    const optimisticMemory: Memory = {
      id: optimisticId,
      child_id: childId,
      title: requestBody.title,
      body: requestBody.body ?? null,
      recorded_at: requestBody.recorded_at,
      weather: requestBody.weather ?? null,
      is_favorite: false,
      ai_generated: requestBody.ai_generated,
      image_ids: requestBody.image_ids,
      cover_thumbnail_url: null,
      created_at: now,
      updated_at: now,
    }

    await queryClient.cancelQueries({ queryKey: memoriesQueryKey })
    const rollback = optimisticAddMemoryToLists(queryClient, optimisticMemory)

    try {
      const created = await createMemoryMutation.mutateAsync(requestBody)
      optimisticReplaceMemoryInLists(queryClient, optimisticId, created)
      showToast({
        tone: 'success',
        title: quietStateCopy.record.saveDoneTitle,
        description: quietStateCopy.record.saveDoneDescription,
      })
      router.push(`/memory/${created.id}?saved=1`)
      router.refresh()
    } catch (e) {
      rollback()
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'validation_error':
            {
              const errors = extractFieldErrors(e.problem)
              setFieldErrors(errors)
              setTopMessage(quietStateCopy.record.validationFailed)
            }
            showToast({
              title: quietStateCopy.record.saveFailedTitle,
              description: quietStateCopy.record.validationFailed,
            })
            break
          case 'unauthorized':
            router.push('/sign-in')
            return
          default:
            setTopMessage(quietStateCopy.record.saveFailedDescription)
            showToast({
              title: quietStateCopy.record.saveFailedTitle,
              description: quietStateCopy.record.saveFailedDescription,
            })
        }
      } else {
        setTopMessage(quietStateCopy.record.saveFailedDescription)
        showToast({
          title: quietStateCopy.record.saveFailedTitle,
          description: quietStateCopy.record.saveFailedDescription,
        })
      }
      setSubmitting(false)
    }
  }

  if (phase === 'loading') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-16">
            <span className="text-ink-tertiary text-sm">{quietStateCopy.common.loading}</span>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (phase === 'no-child') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-xl">
              さきに お子さんの こと、おしえてください
            </CardTitle>
            <CardDescription className="mt-2">
              記録を のこすには、お子さんの プロフィールが ひつようです。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full">
              <Link href="/onboarding" prefetch={false}>
                プロフィールを ひらく
              </Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (phase === 'error') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-xl">
              {quietStateCopy.common.openFailedTitle}
            </CardTitle>
            <CardDescription className="mt-2">
              {quietStateCopy.common.openFailedDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => location.reload()} className="w-full">
              {quietStateCopy.common.retryOpen}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  return (
    <RecordShell>
      <button
        type="button"
        onClick={onCancelClick}
        aria-label="やめて とじる"
        className="bg-elevated text-ink-secondary ring-elevated ease-organic tap-target absolute left-4 top-4 z-20 flex items-center gap-1 rounded-full px-4 py-2 font-serif text-sm ring-1 transition-transform active:scale-[0.97]"
      >
        <span aria-hidden="true">‹</span>
        やめる
      </button>
      <section className="flex min-h-[42dvh] flex-1 flex-col px-5 pb-5 pt-20">
        <p className="meta-label">30びょう 記録</p>
        <h1 className="text-ink mt-2 font-serif text-2xl leading-tight">
          きょうの {childName} ちゃんを のこす
        </h1>
        <p className="text-ink-secondary leading-narrative mt-2 text-sm">
          しゃしんを 1まい えらんで、ことばを そえます。
        </p>

        <div className="photo-mat mt-6 flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-photo-mat)]">
          {filePreviewUrl && file ? (
            <NextImage
              src={filePreviewUrl}
              alt="えらんだ しゃしん"
              width={720}
              height={900}
              unoptimized
              className="h-full max-h-[46dvh] w-full object-cover"
            />
          ) : (
            <div
              data-testid="record-photo-placeholder"
              className="border-hairline/80 bg-paper-slip/55 mx-4 flex min-h-44 w-full flex-col items-center justify-center rounded-[var(--radius-photo-mat)] border border-dashed px-8 text-center"
            >
              <Camera className="text-sakura-deep size-8" aria-hidden="true" />
              <p className="text-ink-secondary mt-4 font-serif text-lg">まずは 1まい</p>
              <p className="text-ink-tertiary leading-narrative mt-2 max-w-64 text-sm">
                うまく撮れた写真でなくても、残したい瞬間なら大丈夫です。
              </p>
            </div>
          )}
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        data-testid="record-bottom-sheet"
        className="bg-elevated border-hairline shadow-lift sticky bottom-0 z-30 flex max-h-[68dvh] flex-col overflow-hidden rounded-t-[var(--radius-sheet)] border-t px-5 pt-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-hairline" aria-hidden="true" />

        <div
          data-testid="record-bottom-sheet-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pt-4"
        >
          {topMessage ? (
            <div
              role="alert"
              className="text-ink-secondary leading-narrative rounded-xl bg-warm px-4 py-3 text-sm"
            >
              {topMessage}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <StepPill active={!uploadedImage} done={!!uploadedImage} label="写真" />
            <StepPill
              active={!!uploadedImage && aiStatus !== 'done'}
              done={aiStatus === 'done'}
              label="下書き"
            />
            <StepPill active={canSubmit} done={false} label="保存" />
          </div>

          <div
            data-testid="record-decision-cue"
            className="border-hairline bg-paper-slip rounded-[var(--radius-paper-slip)] border px-4 py-3"
          >
            <p className="meta-label">{decisionCue.eyebrow}</p>
            <p className="text-ink-secondary leading-narrative mt-2 text-sm">{decisionCue.body}</p>
          </div>

          <Input
            ref={fileInputRef}
            id="memory-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onClick={resetPhotoInput}
            onChange={onFileSelected}
            className="sr-only"
            tabIndex={-1}
            aria-label="しゃしんを えらぶ"
            aria-describedby="memory-photo-status"
          />

          {uploadedImage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={openPhotoPicker}
            >
              しゃしんを えらびなおす
            </Button>
          ) : null}

          <div id="memory-photo-status" className="min-h-4">
            {uploadStatus === 'preparing' ? (
              <p role="status" aria-live="polite" className="text-ink-tertiary text-xs">
                {quietStateCopy.record.uploadPreparing}
              </p>
            ) : null}
            {uploadStatus === 'uploading' ? (
              <p role="status" aria-live="polite" className="text-ink-tertiary text-xs">
                {quietStateCopy.record.uploadUploading}
              </p>
            ) : null}
            {uploadStatus === 'confirming' ? (
              <p role="status" aria-live="polite" className="text-ink-tertiary text-xs">
                {quietStateCopy.record.uploadConfirming}
              </p>
            ) : null}
            {uploadStatus === 'done' ? (
              <p role="status" aria-live="polite" className="text-leaf text-xs">
                {quietStateCopy.record.uploadDone}
              </p>
            ) : null}
            {uploadStatus === 'failed' && uploadError ? (
              <p role="alert" className="text-amber text-xs">
                {uploadError}
              </p>
            ) : null}
            {fieldErrors.imageIds ? (
              <p role="alert" className="text-amber text-xs">
                {fieldErrors.imageIds}
              </p>
            ) : null}
          </div>

          {uploadedImage ? (
            <>
              <div
                data-testid="record-ai-decision"
                className="paper-surface rounded-[var(--radius-paper-slip)] p-4"
                aria-busy={aiStatus === 'generating'}
              >
                <p className="text-ink-secondary font-serif text-sm">
                  {quietStateCopy.record.aiReady}
                </p>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant={aiStatus === 'done' ? 'outline' : 'default'}
                    size="lg"
                    className="w-full"
                    onClick={callAiGenerate}
                    disabled={!canGenerateAi}
                  >
                    {aiStatus === 'generating'
                      ? recordAiGeneratingCopy(childName)
                      : aiStatus === 'done'
                        ? 'もういちど AI に たのむ'
                        : 'AI で 下書きする'}
                  </Button>
                  {aiStatus !== 'done' ? (
                    <Button type="button" variant="ghost" size="sm" onClick={focusManualTitle}>
                      AI を使わずに 書く
                    </Button>
                  ) : null}
                </div>
                {aiStatus === 'generating' ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-ink-tertiary motion-safe:animate-pulse mt-2 text-xs"
                  >
                    <span className="sr-only">{recordAiGeneratingCopy(childName)}</span>
                    {quietStateCopy.record.aiWaitingHint}
                  </p>
                ) : null}
                {aiStatus === 'done' ? (
                  <p role="status" aria-live="polite" className="text-leaf mt-2 text-xs">
                    {quietStateCopy.record.aiDone}
                  </p>
                ) : null}
                {aiError ? (
                  <p role="alert" className="text-amber mt-2 text-xs">
                    {aiError}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="memory-title" className="font-serif">
                  タイトル
                </Label>
                <Input
                  ref={titleInputRef}
                  id="memory-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="はじめての すなあそび"
                  maxLength={100}
                />
                {fieldErrors.title ? (
                  <p role="alert" className="text-amber text-xs">
                    {fieldErrors.title}
                  </p>
                ) : null}
              </div>

              {storyPreview ? (
                <section
                  aria-labelledby="memory-story-preview-title"
                  data-testid="record-story-preview"
                  className="paper-surface rounded-[var(--radius-paper-slip)] p-4"
                >
                  <p
                    id="memory-story-preview-title"
                    className="text-ink-secondary font-serif text-sm"
                  >
                    のこす ことば
                  </p>
                  <p className="text-ink leading-narrative mt-2 whitespace-pre-wrap break-words font-serif text-base [overflow-wrap:anywhere]">
                    {storyPreview}
                  </p>
                </section>
              ) : (
                <p className="text-ink-tertiary leading-narrative text-center text-sm">
                  AI の下書き、または ひとことを添えて残せます。
                </p>
              )}

              <details
                data-testid="record-secondary-edits"
                className="group rounded-[var(--radius-paper-slip)] bg-warm px-4 py-3"
              >
                <summary className="tap-target text-ink-secondary flex cursor-pointer list-none items-center justify-between font-serif text-sm [&::-webkit-details-marker]:hidden">
                  ことば・日付を なおす
                  <span className="text-ink-tertiary text-xs group-open:hidden">ひらく</span>
                  <span className="text-ink-tertiary hidden text-xs group-open:inline">とじる</span>
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="memory-body" className="font-serif">
                      ほんぶん (任意)
                    </Label>
                    <textarea
                      id="memory-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={1000}
                      rows={4}
                      placeholder="あの しゅんかんの こと、ひとこと だけでも。"
                      className="border-hairline bg-elevated text-ink placeholder:text-ink-tertiary placeholder:font-serif leading-narrative focus-visible:border-sakura focus-visible:ring-ring/30 w-full rounded-xl border px-4 py-2 text-base transition-all focus-visible:outline-none focus-visible:ring-2"
                    />
                    {fieldErrors.body ? (
                      <p role="alert" className="text-amber text-xs">
                        {fieldErrors.body}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="memory-date" className="font-serif">
                        ひにち
                      </Label>
                      <Input
                        id="memory-date"
                        type="date"
                        value={recordedAt}
                        onChange={(e) => setRecordedAt(e.target.value)}
                        max={todayIso}
                      />
                      {fieldErrors.recordedAt ? (
                        <p role="alert" className="text-amber text-xs">
                          {fieldErrors.recordedAt}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="memory-weather" className="font-serif">
                        てんき (任意)
                      </Label>
                      <Input
                        id="memory-weather"
                        value={weather}
                        onChange={(e) => setWeather(e.target.value)}
                        placeholder="はれ"
                        maxLength={20}
                      />
                    </div>
                  </div>
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div
          data-testid="record-bottom-sheet-footer"
          className="bg-elevated border-hairline -mx-5 border-t px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        >
          {!hasSelectedPhoto ? (
            <Button type="button" size="lg" className="w-full" onClick={openPhotoPicker}>
              しゃしんを えらぶ
            </Button>
          ) : !uploadedImage ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={openPhotoPicker}
            >
              しゃしんを えらびなおす
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
              {submitting ? quietStateCopy.record.submitting : 'このまま 残す'}
            </Button>
          )}
        </div>
      </form>

      {aiStatus === 'consent_pending' ? (
        <AiConsentDialog
          childName={childName}
          aiConsentAt={aiConsentAt}
          pending={setAiConsentMutation.isPending}
          onAccept={acceptAiConsent}
          onDecline={declineAiConsent}
        />
      ) : null}

      {cancelDialogOpen ? (
        <CancelConfirmDialog
          onKeep={() => setCancelDialogOpen(false)}
          onClose={() => router.push('/')}
        />
      ) : null}
    </RecordShell>
  )
}

function getRecordDecisionCue({
  uploaded,
  aiStatus,
  canSubmit,
  hasStory,
}: {
  uploaded: boolean
  aiStatus: AiStatus
  canSubmit: boolean
  hasStory: boolean
}) {
  if (!uploaded) {
    return {
      eyebrow: 'いまの判断',
      body: 'まずは写真を1まい選びます。選ぶだけでは、まだAIには送りません。',
    }
  }
  if (aiStatus === 'consent_pending') {
    return {
      eyebrow: 'いまの判断',
      body: 'AIを使うか、使わずに残すかを選べます。送るものの説明は閉じずに確認できます。',
    }
  }
  if (aiStatus === 'generating') {
    return {
      eyebrow: 'いまの判断',
      body: '下書きを待っています。入力はこのまま残り、うまくいかない時もやり直せます。',
    }
  }
  if (canSubmit) {
    return {
      eyebrow: 'いまの判断',
      body: hasStory
        ? 'ことばを確認したら、このまま保存できます。'
        : 'タイトルがあれば、AIを使わずにこのまま保存できます。',
    }
  }
  return {
    eyebrow: 'いまの判断',
    body: 'AIの下書きか、ひとことのタイトルを足すかを選びます。',
  }
}

const AI_CONSENT_SENT_COPY =
  'おくるものは、しゃしん、登録した呼び名、月齢、ひにち、てんき、あなたが書いたメモです。'
const AI_CONSENT_NOT_SENT_COPY =
  'たんじょうび、メール、じゅうしょ、位置情報、画像URL、presigned URL、保存先のキーは おくりません。'
const AI_CONSENT_RETENTION_COPY =
  'API の入出力は 通常30日以内に削除されますが、安全確認など一部例外があります。'

function AiConsentDialog({
  childName,
  aiConsentAt,
  pending,
  onAccept,
  onDecline,
}: {
  childName: string
  aiConsentAt: string | null
  pending: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  // 既に同意済みなのに 403 ai_consent_required が返ってきた場合は、サーバとローカルの状態差。
  // ユーザーには通常通り同意ダイアログを見せる (idempotent endpoint なので安全)。
  void aiConsentAt
  // 同意ダイアログは「外側クリックで閉じる」を意図的に **無効**。
  // 明示的に「どういして、つくる」または「AI を つかわない」を押させる (consent UX の鉄則)。
  return (
    <AccessibleDialog
      titleId="ai-consent-title"
      descriptionId="ai-consent-description"
      pending={pending}
      initialFocusId="ai-consent-decline"
      onClose={onDecline}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle id="ai-consent-title" className="font-serif text-xl">
            あなたの しゃしんを、ことばに します
          </CardTitle>
          <CardDescription id="ai-consent-description" className="leading-narrative mt-2">
            Hana は、{childName} ちゃんの しゃしんを Anthropic Claude API に おくり、ぶんしょうの
            ていあんを もらいます。{AI_CONSENT_SENT_COPY}
            {AI_CONSENT_NOT_SENT_COPY}
            {AI_CONSENT_RETENTION_COPY}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" size="lg" onClick={onAccept} disabled={pending} className="w-full">
            {pending ? '同意を しまっています…' : 'どういして、つくる'}
          </Button>
          <Button
            id="ai-consent-decline"
            type="button"
            variant="ghost"
            size="lg"
            onClick={onDecline}
            disabled={pending}
            className="w-full"
          >
            AI を つかわない
          </Button>
          <p className="text-ink-tertiary text-center text-xs">
            くわしい データの あつかいは、せっていで 確認できます。
          </p>
        </CardContent>
      </Card>
    </AccessibleDialog>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-canvas relative flex min-h-dvh items-center justify-center px-6 py-12">
      {children}
    </main>
  )
}

function RecordShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-canvas relative min-h-dvh overflow-x-hidden">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
    </main>
  )
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={
        done
          ? 'border-leaf/30 bg-warm text-leaf rounded-full border px-2 py-1'
          : active
            ? 'border-sakura/40 bg-paper-slip text-sakura-deep rounded-full border px-2 py-1'
            : 'border-hairline bg-warm text-ink-tertiary rounded-full border px-2 py-1'
      }
    >
      {label}
    </div>
  )
}

function CancelConfirmDialog({ onKeep, onClose }: { onKeep: () => void; onClose: () => void }) {
  return (
    <AccessibleDialog
      titleId="cancel-confirm-title"
      descriptionId="cancel-confirm-description"
      initialFocusId="cancel-confirm-keep"
      onClose={onKeep}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle id="cancel-confirm-title" className="font-serif text-xl">
            ほぞんせずに とじますか？
          </CardTitle>
          <CardDescription id="cancel-confirm-description" className="leading-narrative mt-2">
            なおした ぶんは うしなわれます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            id="cancel-confirm-keep"
            type="button"
            size="lg"
            onClick={onKeep}
            className="w-full"
          >
            もうすこし なおす
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onClose}
            className="text-ink-tertiary w-full"
          >
            とじる
          </Button>
        </CardContent>
      </Card>
    </AccessibleDialog>
  )
}
