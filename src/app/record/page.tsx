'use client'

import NextImage from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, PenLine } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuietIcon } from '@/components/product/icons'
import {
  KeepsakePreview,
  PaperSlip,
  PhotoInner,
  PhotoMat,
  PhotoPlaceholder,
  StatePanel,
} from '@/components/product/surfaces'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AccessibleDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useChildrenQuery } from '@/features/children/client/use-children'
import {
  memoriesQueryKey,
  useCreateMemoryMutation,
  type Memory,
  type MemoryCreateRequest,
} from '@/features/memories/client/use-memories'
import {
  PARENT_NOTE_MAX_LENGTH,
  toAiParentNote,
} from '@/features/memories/client/record-parent-note'
import { runTimedAiRequest } from '@/features/memories/client/record-ai-request'
import {
  createRecordIdempotencyKey,
  recordDraftStore,
} from '@/features/memories/client/record-draft-store'
import {
  beginRecordPhotoAttempt,
  confirmRecordPhotoAttempt,
  createAsyncLimiter,
  createRecordPhotoItem,
  failRecordPhotoAttempt,
  getOrderedConfirmedImageIds,
  getRecordPhotoAggregate,
  moveRecordPhoto,
  removeRecordPhoto,
  updateRecordPhoto,
  RECORD_PHOTO_MAX,
  type RecordPhotoItem,
  type RecordPhotoStatus,
} from '@/features/memories/client/record-photo-state'
import { getRecordFooterState } from '@/features/memories/client/record-footer-state'
import {
  getUploadRetryStartStage,
  runUploadStages,
  type UploadFailureStage,
} from '@/features/memories/client/record-upload-retry'
import { useCurrentUserQuery, useSetAiConsentMutation } from '@/features/me/client/use-current-user'
import {
  createProductEventFlowId,
  reportProductEvent,
  type ProductEventName,
} from '@/features/metrics/client/product-events'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { optimisticAddMemoryToLists, optimisticReplaceMemoryInLists } from '@/lib/perf/optimistic'
import { useToast } from '@/components/ui/toast'
import { signInPath } from '@/lib/auth/safe-redirect'
import { focusFirstFormError } from '@/lib/ui/form-error-focus'
import { quietStateCopy, recordAiGeneratingCopy } from '@/lib/ui/quiet-state-copy'
import { RecordPhotoList } from '@/features/memories/components/record-photo-list'

type Phase = 'loading' | 'no-child' | 'form' | 'error'
type AiStatus = 'idle' | 'consent_pending' | 'generating' | 'done' | 'failed'

interface FieldErrors {
  title?: string
  body?: string
  recordedAt?: string
  imageIds?: string
  general?: string
}

const recordFieldErrorCopy = {
  titleRequired: 'タイトルを 入れてください。',
  titleTooLong: 'タイトルは 100文字までで 入れてください。',
  titleInvalid: 'タイトルを たしかめてください。',
  bodyTooLong: 'ほんぶんは 1000文字までで 入れてください。',
  bodyInvalid: 'ほんぶんを たしかめてください。',
  recordedAtRequired: 'ひにちを 選んでください。',
  recordedAtFuture: 'ひにちは、きょうまでの日を 選んでください。',
  recordedAtInvalid: '有効な ひにちを 選んでください。',
  imageIdsRequired: '写真を 1まい 選んでください。',
  imageIdsReselect: '写真を もういちど 選んでください。',
  imageIdsInvalid: '写真を たしかめてください。',
} as const

const PHOTO_LIMIT_MESSAGE =
  '写真は5枚までです。6枚目は追加されませんでした。選んだ5枚はそのままです。'

function extractFieldErrors(problem: ProblemDetails): FieldErrors {
  const fields: FieldErrors = {}
  for (const err of problem.errors ?? []) {
    if (err.path === 'body.title') {
      fields.title =
        err.reason === 'required' || err.reason === 'too_short'
          ? recordFieldErrorCopy.titleRequired
          : err.reason === 'too_long'
            ? recordFieldErrorCopy.titleTooLong
            : recordFieldErrorCopy.titleInvalid
    } else if (err.path === 'body.body') {
      fields.body =
        err.reason === 'too_long'
          ? recordFieldErrorCopy.bodyTooLong
          : recordFieldErrorCopy.bodyInvalid
    } else if (err.path === 'body.recorded_at') {
      fields.recordedAt =
        err.reason === 'required'
          ? recordFieldErrorCopy.recordedAtRequired
          : err.reason === 'future_date'
            ? recordFieldErrorCopy.recordedAtFuture
            : recordFieldErrorCopy.recordedAtInvalid
    } else if (err.path.startsWith('body.image_ids')) {
      fields.imageIds =
        err.reason === 'required' || err.reason === 'too_few'
          ? recordFieldErrorCopy.imageIdsRequired
          : err.reason === 'image_not_found' || err.reason === 'already_linked'
            ? recordFieldErrorCopy.imageIdsReselect
            : recordFieldErrorCopy.imageIdsInvalid
    }
  }
  return fields
}

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp'

interface EncodedPhoto {
  blob: Blob
  contentType: AllowedMime
  width: number
  height: number
}

interface UploadCache {
  encoded: EncodedPhoto
  fileName: string
  target: { presignedUrl: string; storageKey: string } | null
}

interface ActiveUploadAttempt {
  clientId: string
  id: number
  signal: AbortSignal
}

type PhotoRemovalStatus = 'idle' | 'deleting' | 'failed'

interface RecordPhoto extends RecordPhotoItem {
  file: File | null
  previewUrl: string | null
  previewIsObjectUrl: boolean
  removalStatus: PhotoRemovalStatus
}

interface UploadRuntime {
  attemptId: number
  controller: AbortController | null
  inFlight: boolean
  cache: UploadCache | null
}

interface ActiveAiAttempt {
  id: number
  controller: AbortController
}

async function reencodeImage(file: File): Promise<EncodedPhoto> {
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

function revokePhotoPreview(photo: RecordPhoto) {
  if (photo.previewIsObjectUrl && photo.previewUrl) URL.revokeObjectURL(photo.previewUrl)
}

function sameOrderedValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function invalidImageIndexes(problem: ProblemDetails, photoCount: number): number[] {
  const indexes = new Set<number>()
  for (const error of problem.errors ?? []) {
    if (error.reason !== 'image_not_found' && error.reason !== 'already_linked') continue
    const match = /^body\.image_ids\[(\d+)\]$/.exec(error.path)
    if (match) indexes.add(Number(match[1]))
    else if (error.path === 'body.image_ids' && photoCount === 1) indexes.add(0)
  }
  return [...indexes].filter((index) => index >= 0 && index < photoCount)
}

function getAggregateUploadStatus(photos: readonly RecordPhoto[]) {
  if (photos.length === 0) return 'idle' as const
  if (photos.some((photo) => photo.status === 'failed' || photo.removalStatus === 'failed')) {
    return 'failed' as const
  }
  if (photos.every((photo) => photo.status === 'confirmed')) return 'done' as const
  if (photos.some((photo) => photo.status === 'confirming' || photo.removalStatus === 'deleting')) {
    return 'confirming' as const
  }
  if (photos.some((photo) => photo.status === 'uploading')) return 'uploading' as const
  return 'preparing' as const
}

function toPhotoListStatus(photo: RecordPhoto) {
  if (photo.removalStatus === 'failed') return 'failed' as const
  if (photo.removalStatus === 'deleting') return 'confirming' as const
  if (photo.status === 'selected') return 'idle' as const
  if (photo.status === 'confirmed') return 'done' as const
  return photo.status
}

export default function RecordPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [idempotencyKey, setIdempotencyKey] = useState(createRecordIdempotencyKey)
  const [draftInitialized, setDraftInitialized] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const draftValidationStartedRef = useRef(false)
  const [aiConsentAtOverride, setAiConsentAtOverride] = useState<string | null>(null)

  const [photos, setPhotos] = useState<RecordPhoto[]>([])
  const [photoAnnouncement, setPhotoAnnouncement] = useState('')
  const [photoSelectionMessage, setPhotoSelectionMessage] = useState<string | null>(null)

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiTimedOut, setAiTimedOut] = useState(false)
  const [aiQuotaExceeded, setAiQuotaExceeded] = useState(false)
  const [hasAiGeneratedContent, setHasAiGeneratedContent] = useState(false)
  const [aiDraftNeedsReview, setAiDraftNeedsReview] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [parentNote, setParentNote] = useState('')
  const [recordedAt, setRecordedAt] = useState(todayIso)
  const [weather, setWeather] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [topMessage, setTopMessage] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const bodyInputRef = useRef<HTMLTextAreaElement>(null)
  const recordedAtInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoActionButtonRef = useRef<HTMLButtonElement>(null)
  const secondaryEditsRef = useRef<HTMLDetailsElement>(null)
  const recordErrorSummaryRef = useRef<HTMLDivElement>(null)
  const errorFocusRequestedRef = useRef(false)
  const saveInFlightRef = useRef(false)
  const focusAfterUploadRef = useRef(false)
  const primaryActionButtonRef = useRef<HTMLButtonElement>(null)
  const photosRef = useRef<RecordPhoto[]>([])
  const uploadRuntimeRef = useRef(new Map<string, UploadRuntime>())
  const limitUploadRef = useRef(createAsyncLimiter(2))
  const aiRequestIdRef = useRef(0)
  const aiAbortControllerRef = useRef<AbortController | null>(null)
  const aiActionInFlightRef = useRef(false)
  const productFlowIdRef = useRef<string | null>(null)
  const productFlowStartedAtRef = useRef<number | null>(null)
  const reportedProductEventsRef = useRef(new Set<ProductEventName>())
  const currentUserQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const setAiConsentMutation = useSetAiConsentMutation()
  const createMemoryMutation = useCreateMemoryMutation()

  const selectedChild = childrenQuery.data?.data[0] ?? null
  const currentUserId = currentUserQuery.data?.id ?? null
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
  const photoAggregate = getRecordPhotoAggregate(photos)
  const primaryPhoto = photos[0] ?? null
  const confirmedImageIds = getOrderedConfirmedImageIds(photos)
  const allPhotosConfirmed = confirmedImageIds !== null
  const firstFailedPhoto = photos.find(
    (photo) => photo.status === 'failed' || photo.removalStatus === 'failed',
  )
  const uploadStatus = getAggregateUploadStatus(photos)
  const uploadFailureStage = firstFailedPhoto?.failureStage ?? null
  const canSubmit =
    allPhotosConfirmed &&
    !aiDraftNeedsReview &&
    title.trim().length > 0 &&
    recordedAt.length > 0 &&
    !submitting
  const hasFieldErrors = Object.keys(fieldErrors).length > 0
  const formErrorMessage =
    topMessage ?? (hasFieldErrors ? quietStateCopy.record.validationFailed : null)
  const hasSelectedPhoto = photos.length > 0
  const photoReplacementLocked = submitting
  const storyPreview = body.trim()
  const hasUnsavedChanges =
    hasSelectedPhoto ||
    title.trim().length > 0 ||
    storyPreview.length > 0 ||
    parentNote.trim().length > 0 ||
    weather.trim().length > 0 ||
    recordedAt !== todayIso
  const decisionCue = getRecordDecisionCue({
    uploaded: allPhotosConfirmed,
    aiStatus,
    canSubmit,
    hasTitle: title.trim().length > 0,
    hasStory: storyPreview.length > 0,
  })
  const footerState = getRecordFooterState({
    hasSelectedPhoto,
    uploaded: allPhotosConfirmed,
    uploadStatus,
    uploadFailureStage,
    aiStatus,
    aiTimedOut,
    aiQuotaExceeded,
    aiDraftNeedsReview,
    hasTitle: title.trim().length > 0,
    canSubmit,
    submitting,
  })
  const draftComplete = aiStatus === 'done' || (aiStatus === 'idle' && canSubmit)
  const currentStepLabel = !allPhotosConfirmed
    ? '写真を選ぶ'
    : draftComplete
      ? '保存する'
      : '下書きを整える'

  const reportRecordProductEvent = useCallback((eventName: ProductEventName) => {
    if (reportedProductEventsRef.current.has(eventName)) return
    try {
      const flowId = productFlowIdRef.current ?? createProductEventFlowId()
      const startedAt = productFlowStartedAtRef.current ?? performance.now()
      productFlowIdRef.current = flowId
      productFlowStartedAtRef.current = startedAt
      reportedProductEventsRef.current.add(eventName)
      reportProductEvent({
        eventName,
        flowId,
        elapsedMs: eventName === 'record_started' ? null : performance.now() - startedAt,
      })
    } catch {
      return
    }
  }, [])

  function onCancelClick() {
    if (submitting) return
    if (hasUnsavedChanges) {
      setCancelDialogOpen(true)
    } else {
      router.push('/')
    }
  }

  async function discardDraftAndClose() {
    if (discarding) return
    setDiscarding(true)
    for (const runtime of uploadRuntimeRef.current.values()) runtime.controller?.abort()
    const confirmedIds = photosRef.current.flatMap((photo) =>
      photo.imageId ? [photo.imageId] : [],
    )
    recordDraftStore.clear()
    const client = getBrowserApiClient()
    await Promise.allSettled(
      confirmedIds.map((imageId) =>
        limitUploadRef.current(() =>
          client.DELETE('/uploads/{imageId}', { params: { path: { imageId } } }).then(() => {}),
        ),
      ),
    )
    for (const photo of photosRef.current) revokePhotoPreview(photo)
    router.push('/')
  }

  useEffect(() => {
    if (isUnauthorized) {
      router.push(signInPath(`${window.location.pathname}${window.location.search}`))
    }
  }, [isUnauthorized, router])

  useEffect(() => {
    if (phase !== 'form' || draftInitialized || !currentUserId) return
    const draft = recordDraftStore.load(currentUserId)
    let cancelled = false
    const restoreTimer = window.setTimeout(() => {
      if (cancelled) return
      if (draft) {
        setIdempotencyKey(draft.idempotencyKey)
        setTitle(draft.title)
        setBody(draft.body)
        setParentNote(draft.parentNote)
        setRecordedAt(draft.recordedAt)
        setWeather(draft.weather)
        setPhotos(
          draft.imageIds.map((imageId) => ({
            ...createRecordPhotoItem(`restored-${imageId}`),
            imageId,
            status: 'confirmed',
            file: null,
            previewUrl: null,
            previewIsObjectUrl: false,
            removalStatus: 'idle',
          })),
        )
        setHasAiGeneratedContent(draft.aiGenerated)
        setAiDraftNeedsReview(draft.aiDraftNeedsReview)
        setAiStatus(draft.aiGenerated ? 'done' : 'idle')
        setDraftRestored(true)
      }
      setDraftInitialized(true)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(restoreTimer)
    }
  }, [currentUserId, draftInitialized, phase])

  useEffect(() => {
    if (!draftInitialized || !currentUserId) return
    const hasDraftContent =
      photos.some((photo) => photo.imageId !== null) ||
      title.trim().length > 0 ||
      body.trim().length > 0 ||
      parentNote.trim().length > 0 ||
      weather.trim().length > 0 ||
      recordedAt !== todayIso
    if (!hasDraftContent) {
      recordDraftStore.clear()
      return
    }
    recordDraftStore.save(currentUserId, {
      idempotencyKey,
      title,
      body,
      parentNote,
      recordedAt,
      weather,
      imageIds: photos
        .filter((photo) => photo.status === 'confirmed' && photo.imageId !== null)
        .map((photo) => photo.imageId as string),
      aiGenerated: hasAiGeneratedContent,
      aiDraftNeedsReview,
    })
  }, [
    body,
    currentUserId,
    draftInitialized,
    hasAiGeneratedContent,
    aiDraftNeedsReview,
    idempotencyKey,
    parentNote,
    recordedAt,
    title,
    todayIso,
    photos,
    weather,
  ])

  useEffect(() => {
    if (!draftRestored || draftValidationStartedRef.current) return
    const restored = photosRef.current.filter(
      (photo) => photo.clientId.startsWith('restored-') && photo.imageId,
    )
    if (restored.length === 0) return
    draftValidationStartedRef.current = true
    let cancelled = false
    const client = getBrowserApiClient()
    void Promise.all(
      restored.map(async (photo) => {
        try {
          const response = await client.GET('/uploads/{imageId}/url', {
            params: {
              path: { imageId: photo.imageId! },
              query: { size: 'thumbnail', context: 'record-draft' },
            },
          })
          return response.data?.url
            ? { clientId: photo.clientId, kind: 'valid' as const, url: response.data.url }
            : { clientId: photo.clientId, kind: 'unavailable' as const }
        } catch (error) {
          if (isApiProblemError(error) && error.reason === 'unauthorized') {
            router.push(signInPath(`${window.location.pathname}${window.location.search}`))
          }
          return isApiProblemError(error) && error.reason === 'not_found'
            ? { clientId: photo.clientId, kind: 'invalid' as const }
            : { clientId: photo.clientId, kind: 'unavailable' as const }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const invalid = new Set(
        results.filter((result) => result.kind === 'invalid').map((result) => result.clientId),
      )
      const previewByClientId = new Map(
        results.flatMap((result) =>
          result.kind === 'valid' ? [[result.clientId, result.url] as const] : [],
        ),
      )
      commitPhotos((current) =>
        current
          .filter((photo) => !invalid.has(photo.clientId))
          .map((photo) => {
            const previewUrl = previewByClientId.get(photo.clientId)
            return previewUrl ? { ...photo, previewUrl, previewIsObjectUrl: false } : photo
          }),
      )
      if (invalid.size > 0) {
        if (hasAiGeneratedContent) setAiDraftNeedsReview(true)
        setPhotoAnnouncement('使えなくなった写真を下書きから外しました。ほかの入力はそのままです。')
      }
    })
    return () => {
      cancelled = true
    }
  }, [draftRestored, hasAiGeneratedContent, router])

  useEffect(() => {
    if (phase !== 'form') return
    reportRecordProductEvent('record_started')
  }, [phase, reportRecordProductEvent])

  useEffect(() => {
    if (aiStatus !== 'done' || storyPreview.length === 0) return
    reportRecordProductEvent('ai_draft_shown')
  }, [aiStatus, reportRecordProductEvent, storyPreview])

  useEffect(() => {
    if (aiStatus !== 'failed' || !aiTimedOut) return
    primaryActionButtonRef.current?.focus()
  }, [aiStatus, aiTimedOut])

  useEffect(() => {
    if (!allPhotosConfirmed || !focusAfterUploadRef.current) return
    focusAfterUploadRef.current = false
    primaryActionButtonRef.current?.focus()
  }, [allPhotosConfirmed])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    const uploadRuntimes = uploadRuntimeRef.current
    return () => {
      for (const runtime of uploadRuntimes.values()) runtime.controller?.abort()
      for (const photo of photosRef.current) revokePhotoPreview(photo)
      aiRequestIdRef.current += 1
      aiAbortControllerRef.current?.abort()
      aiActionInFlightRef.current = false
    }
  }, [])

  function commitPhotos(update: (current: RecordPhoto[]) => RecordPhoto[]) {
    const next = update(photosRef.current)
    photosRef.current = next
    setPhotos(next)
  }

  function getUploadRuntime(clientId: string): UploadRuntime {
    const current = uploadRuntimeRef.current.get(clientId)
    if (current) return current
    const created: UploadRuntime = {
      attemptId: 0,
      controller: null,
      inFlight: false,
      cache: null,
    }
    uploadRuntimeRef.current.set(clientId, created)
    return created
  }

  function startUploadAttempt(clientId: string): ActiveUploadAttempt | null {
    const currentPhoto = photosRef.current.find((photo) => photo.clientId === clientId)
    if (!currentPhoto) return null
    const runtime = getUploadRuntime(clientId)
    if (runtime.inFlight) return null
    runtime.controller?.abort()
    const controller = new AbortController()
    const started = beginRecordPhotoAttempt(currentPhoto)
    runtime.attemptId = started.attempt
    runtime.controller = controller
    runtime.inFlight = true
    commitPhotos((current) =>
      updateRecordPhoto(current, clientId, (photo) =>
        photo.attempt >= started.attempt ? photo : { ...photo, ...started },
      ),
    )
    return { clientId, id: started.attempt, signal: controller.signal }
  }

  function isCurrentUploadAttempt(attempt: ActiveUploadAttempt): boolean {
    const runtime = uploadRuntimeRef.current.get(attempt.clientId)
    const photo = photosRef.current.find((current) => current.clientId === attempt.clientId)
    return (
      runtime?.attemptId === attempt.id && photo?.attempt === attempt.id && !attempt.signal.aborted
    )
  }

  function finishUploadAttempt(attempt: ActiveUploadAttempt) {
    if (!isCurrentUploadAttempt(attempt)) return
    const runtime = uploadRuntimeRef.current.get(attempt.clientId)
    if (!runtime) return
    runtime.inFlight = false
    runtime.controller = null
  }

  function startAiAttempt(): ActiveAiAttempt | null {
    if (aiActionInFlightRef.current) return null
    const id = aiRequestIdRef.current + 1
    aiRequestIdRef.current = id
    aiAbortControllerRef.current?.abort()
    const controller = new AbortController()
    aiAbortControllerRef.current = controller
    aiActionInFlightRef.current = true
    return { id, controller }
  }

  function isCurrentAiAttempt(attempt: ActiveAiAttempt): boolean {
    return aiRequestIdRef.current === attempt.id
  }

  function finishAiAttempt(attempt: ActiveAiAttempt) {
    if (!isCurrentAiAttempt(attempt)) return
    aiActionInFlightRef.current = false
    if (aiAbortControllerRef.current === attempt.controller) {
      aiAbortControllerRef.current = null
    }
  }

  function cancelAiAttempt() {
    aiRequestIdRef.current += 1
    aiAbortControllerRef.current?.abort()
    aiAbortControllerRef.current = null
    aiActionInFlightRef.current = false
  }

  function getUploadFailureMessage(stage: UploadFailureStage): string {
    if (stage === 'confirm') return quietStateCopy.record.uploadConfirmFailed
    if (stage === 'put') return quietStateCopy.record.uploadPutFailed
    return quietStateCopy.record.uploadPrepareFailed
  }

  function markUploadFailed(attempt: ActiveUploadAttempt, stage: UploadFailureStage) {
    if (!isCurrentUploadAttempt(attempt)) return
    commitPhotos((current) =>
      updateRecordPhoto(current, attempt.clientId, (photo) => ({
        ...failRecordPhotoAttempt(photo, attempt.id, stage),
        removalStatus: 'idle',
      })),
    )
    setPhotoAnnouncement(
      `${photoPositionLabel(attempt.clientId)}を送れませんでした。${getUploadFailureMessage(stage)}`,
    )
    finishUploadAttempt(attempt)
  }

  async function runCachedUpload(
    clientId: string,
    cache: UploadCache,
    attempt: ActiveUploadAttempt,
    startStage: UploadFailureStage,
  ) {
    const client = getBrowserApiClient()
    const result = await runUploadStages({
      startStage,
      target: cache.target,
      isCurrent: () => isCurrentUploadAttempt(attempt),
      onStageChange: (stage) => {
        if (!isCurrentUploadAttempt(attempt)) return
        const status: RecordPhotoStatus =
          stage === 'prepare' ? 'preparing' : stage === 'put' ? 'uploading' : 'confirming'
        commitPhotos((current) =>
          updateRecordPhoto(current, clientId, (photo) =>
            photo.attempt === attempt.id ? { ...photo, status } : photo,
          ),
        )
        const action =
          status === 'preparing'
            ? 'を準備しています。'
            : status === 'uploading'
              ? 'を送っています。'
              : 'の保存を確認しています。'
        setPhotoAnnouncement(`${photoPositionLabel(clientId)}${action}`)
      },
      prepare: async () => {
        const presigned = await client.POST('/uploads/presigned-url', {
          body: {
            file_name: cache.fileName,
            content_type: cache.encoded.contentType,
          },
          signal: attempt.signal,
        })
        if (!presigned.data) throw new Error('upload_prepare_failed')
        return {
          presignedUrl: presigned.data.presigned_url,
          storageKey: presigned.data.storage_key,
        }
      },
      put: async (target) => {
        const response = await fetch(target.presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': cache.encoded.contentType },
          body: cache.encoded.blob,
          signal: attempt.signal,
        })
        if (!response.ok) throw new Error('upload_failed')
      },
      confirm: async (target) => {
        const confirmed = await client.POST('/uploads/confirm', {
          body: {
            storage_key: target.storageKey,
            width: cache.encoded.width,
            height: cache.encoded.height,
            file_size: cache.encoded.blob.size,
          },
          signal: attempt.signal,
        })
        if (!confirmed.data) throw new Error('upload_confirm_failed')
        return confirmed.data.id
      },
    })

    if (result.kind === 'stale') return
    cache.target = result.target
    if (result.kind === 'failed') {
      markUploadFailed(attempt, result.stage)
      return
    }

    commitPhotos((current) =>
      updateRecordPhoto(current, clientId, (photo) => ({
        ...confirmRecordPhotoAttempt(photo, attempt.id, result.value),
        removalStatus: 'idle',
      })),
    )
    const runtime = uploadRuntimeRef.current.get(clientId)
    if (runtime) runtime.cache = null
    setPhotoAnnouncement(`${photoPositionLabel(clientId)}を追加できました。`)
    finishUploadAttempt(attempt)
  }

  function invalidateAiAfterPhotoChange() {
    cancelAiAttempt()
    setAiStatus('idle')
    setAiError(null)
    setAiTimedOut(false)
    if (hasAiGeneratedContent) setAiDraftNeedsReview(true)
  }

  function photoPositionLabel(clientId: string) {
    const index = photosRef.current.findIndex((photo) => photo.clientId === clientId)
    return index < 0 ? '写真' : `写真${index + 1}／${photosRef.current.length}`
  }

  async function uploadPhoto(clientId: string, retryStage: UploadFailureStage = 'prepare') {
    const photo = photosRef.current.find((current) => current.clientId === clientId)
    if (!photo?.file) return
    const runtime = getUploadRuntime(clientId)
    const attempt = startUploadAttempt(clientId)
    if (!attempt) return
    await limitUploadRef.current(async () => {
      if (!isCurrentUploadAttempt(attempt)) return
      let cache = runtime.cache
      if (!cache) {
        try {
          const encoded = await reencodeImage(photo.file as File)
          if (!isCurrentUploadAttempt(attempt)) return
          cache = { encoded, fileName: photo.file!.name, target: null }
          runtime.cache = cache
        } catch {
          markUploadFailed(attempt, 'prepare')
          return
        }
      }
      const retryStartStage = getUploadRetryStartStage(retryStage)
      if (retryStage === 'put') cache.target = null
      await runCachedUpload(clientId, cache, attempt, retryStartStage)
    })
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length === 0) return
    const available = Math.max(0, RECORD_PHOTO_MAX - photosRef.current.length)
    const acceptedFiles = selectedFiles.slice(0, available)
    if (acceptedFiles.length === 0) {
      setPhotoSelectionMessage(PHOTO_LIMIT_MESSAGE)
      setPhotoAnnouncement(PHOTO_LIMIT_MESSAGE)
      return
    }
    clearFieldError('imageIds')
    focusAfterUploadRef.current = true
    invalidateAiAfterPhotoChange()
    setIdempotencyKey(createRecordIdempotencyKey())
    setDraftRestored(false)
    reportRecordProductEvent('photo_selected')
    const added: RecordPhoto[] = acceptedFiles.map((nextFile) => ({
      ...createRecordPhotoItem(),
      file: nextFile,
      previewUrl: URL.createObjectURL(nextFile),
      previewIsObjectUrl: true,
      removalStatus: 'idle',
    }))
    commitPhotos((current) => [...current, ...added])
    for (const photo of added) void uploadPhoto(photo.clientId)
    if (selectedFiles.length > acceptedFiles.length) {
      setPhotoSelectionMessage(PHOTO_LIMIT_MESSAGE)
      setPhotoAnnouncement(PHOTO_LIMIT_MESSAGE)
    } else {
      setPhotoSelectionMessage(null)
      setPhotoAnnouncement(`${added.length}枚の写真を追加しました。`)
    }
  }

  function retryUpload(clientId = firstFailedPhoto?.clientId) {
    if (!clientId) return
    const photo = photosRef.current.find((current) => current.clientId === clientId)
    if (!photo) return
    if (photo.removalStatus === 'failed') {
      void removeSelectedPhoto(clientId)
      return
    }
    if (!photo.failureStage) return
    focusAfterUploadRef.current = true
    void uploadPhoto(clientId, photo.failureStage)
  }

  function moveSelectedPhoto(clientId: string, direction: 'up' | 'down') {
    commitPhotos((current) => moveRecordPhoto(current, clientId, direction))
    setIdempotencyKey(createRecordIdempotencyKey())
    setDraftRestored(false)
    invalidateAiAfterPhotoChange()
  }

  async function removeSelectedPhoto(clientId: string) {
    const photo = photosRef.current.find((current) => current.clientId === clientId)
    if (!photo || photo.removalStatus === 'deleting') return
    const runtime = uploadRuntimeRef.current.get(clientId)
    const removingLabel = photoPositionLabel(clientId)
    runtime?.controller?.abort()
    if (!photo.imageId) {
      uploadRuntimeRef.current.delete(clientId)
      revokePhotoPreview(photo)
      commitPhotos((current) => removeRecordPhoto(current, clientId))
      setPhotoSelectionMessage(null)
      setPhotoAnnouncement(
        `${removingLabel}を削除しました。残り${photosRef.current.length}枚です。`,
      )
      setIdempotencyKey(createRecordIdempotencyKey())
      invalidateAiAfterPhotoChange()
      return
    }

    commitPhotos((current) =>
      updateRecordPhoto(current, clientId, (currentPhoto) => ({
        ...currentPhoto,
        status: 'confirming',
        removalStatus: 'deleting',
      })),
    )
    try {
      const client = getBrowserApiClient()
      await client.DELETE('/uploads/{imageId}', {
        params: { path: { imageId: photo.imageId } },
      })
      revokePhotoPreview(photo)
      uploadRuntimeRef.current.delete(clientId)
      commitPhotos((current) => removeRecordPhoto(current, clientId))
      setPhotoSelectionMessage(null)
      setPhotoAnnouncement(
        `${removingLabel}を削除しました。残り${photosRef.current.length}枚です。`,
      )
      setIdempotencyKey(createRecordIdempotencyKey())
      invalidateAiAfterPhotoChange()
    } catch (error) {
      if (
        isApiProblemError(error) &&
        (error.reason === 'image_already_linked' || error.reason === 'not_found')
      ) {
        revokePhotoPreview(photo)
        uploadRuntimeRef.current.delete(clientId)
        commitPhotos((current) => removeRecordPhoto(current, clientId))
        setPhotoSelectionMessage(null)
        setPhotoAnnouncement(
          error.reason === 'not_found'
            ? `${removingLabel}はすでに削除されていました。下書きから外しました。`
            : `${removingLabel}は別の記録で使われています。下書きから外しました。`,
        )
        setIdempotencyKey(createRecordIdempotencyKey())
        invalidateAiAfterPhotoChange()
        return
      }
      commitPhotos((current) =>
        updateRecordPhoto(current, clientId, (currentPhoto) => ({
          ...currentPhoto,
          status: 'failed',
          failureStage: 'confirm',
          removalStatus: 'failed',
        })),
      )
      setPhotoAnnouncement(`${removingLabel}を削除できませんでした。もういちど削除できます。`)
    }
  }

  function resetPhotoInput(event: React.MouseEvent<HTMLInputElement>) {
    event.currentTarget.value = ''
  }

  function openPhotoPicker() {
    fileInputRef.current?.click()
  }

  async function callAiGenerate({ consentConfirmed }: { consentConfirmed: boolean }) {
    const imageIds = getOrderedConfirmedImageIds(photosRef.current)
    if (!imageIds || !childId) return
    if (!consentConfirmed) {
      setAiStatus('consent_pending')
      return
    }
    const attempt = startAiAttempt()
    if (!attempt) return
    setAiStatus('generating')
    setAiError(null)
    setAiTimedOut(false)
    const client = getBrowserApiClient()
    const result = await runTimedAiRequest({
      controller: attempt.controller,
      isCurrent: () => isCurrentAiAttempt(attempt),
      request: (signal) =>
        client.POST('/ai/generate', {
          body: {
            child_id: childId,
            image_ids: imageIds,
            recorded_at: recordedAt || null,
            weather: weather.trim() === '' ? null : weather,
            parent_note: toAiParentNote(parentNote),
          },
          signal,
        }),
    })
    if (result.kind === 'stale') return
    const currentImageIds = getOrderedConfirmedImageIds(photosRef.current)
    if (!currentImageIds || !sameOrderedValues(currentImageIds, imageIds)) {
      finishAiAttempt(attempt)
      return
    }
    finishAiAttempt(attempt)

    if (result.kind === 'timeout') {
      setAiStatus('failed')
      setAiTimedOut(true)
      setAiError(quietStateCopy.record.aiTimedOut)
      return
    }

    if (result.kind === 'success') {
      const res = result.value
      if (!res.data) {
        setAiStatus('failed')
        setAiError(quietStateCopy.record.aiFailed)
        return
      }
      setTitle(res.data.title)
      setBody(res.data.body)
      setFieldErrors((current) => {
        if (!current.title && !current.body) return current
        const next = { ...current }
        delete next.title
        delete next.body
        return next
      })
      setTopMessage((current) =>
        current === quietStateCopy.record.validationFailed ? null : current,
      )
      setHasAiGeneratedContent(true)
      setAiDraftNeedsReview(false)
      setAiStatus('done')
      return
    }

    const e = result.error
    if (isApiProblemError(e)) {
      switch (e.reason) {
        case 'unauthorized':
          router.push(signInPath(`${window.location.pathname}${window.location.search}`))
          return
        case 'ai_consent_required':
          setAiStatus('consent_pending')
          return
        case 'ai_quota_exceeded':
          setAiQuotaExceeded(true)
          setAiStatus('failed')
          setAiError(quietStateCopy.record.aiQuotaExceeded)
          return
        case 'ai_output_rejected':
          setAiStatus('failed')
          setAiError(quietStateCopy.record.aiFailed)
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

  function requestAiGenerate() {
    void callAiGenerate({ consentConfirmed: aiConsentAt !== null })
  }

  function confirmStaleAiDraft() {
    setAiDraftNeedsReview(false)
    setAiStatus('done')
    setAiError(null)
    setAiTimedOut(false)
  }

  async function acceptAiConsent() {
    try {
      const user = await setAiConsentMutation.mutateAsync()
      setAiConsentAtOverride(user.ai_consent_at)
      setAiStatus('idle')
      void callAiGenerate({ consentConfirmed: user.ai_consent_at !== null })
    } catch {
      setAiStatus('failed')
      setAiError(quietStateCopy.record.consentSaveFailed)
    }
  }

  function declineAiConsent() {
    setAiStatus('idle')
  }

  function focusManualTitle() {
    if (aiStatus === 'failed') {
      setAiStatus('idle')
      setAiTimedOut(false)
      setAiError(null)
    }
    titleInputRef.current?.focus()
  }

  function runFooterSecondaryAction() {
    if (footerState.secondaryAction === 'retry-ai') {
      requestAiGenerate()
      return
    }
    if (footerState.secondaryAction === 'choose-photo') {
      openPhotoPicker()
      return
    }
    if (footerState.secondaryAction === 'confirm-ai-draft') {
      confirmStaleAiDraft()
      return
    }
    focusManualTitle()
  }

  useEffect(() => {
    if (!errorFocusRequestedRef.current) return
    errorFocusRequestedRef.current = false
    if (fieldErrors.body || fieldErrors.recordedAt) {
      if (secondaryEditsRef.current) secondaryEditsRef.current.open = true
    }
    focusFirstFormError({
      errors: fieldErrors,
      fieldOrder: ['imageIds', 'title', 'body', 'recordedAt'],
      fieldTargets: {
        imageIds: photoActionButtonRef.current,
        title: titleInputRef.current,
        body: bodyInputRef.current,
        recordedAt: recordedAtInputRef.current,
      },
      fallbackTarget: recordErrorSummaryRef.current,
    })
  }, [fieldErrors, topMessage])

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    if (topMessage === quietStateCopy.record.validationFailed) setTopMessage(null)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveInFlightRef.current) return
    const trimmedTitle = title.trim()
    const orderedImageIds = getOrderedConfirmedImageIds(photosRef.current)
    if (!childId || aiStatus === 'generating' || aiStatus === 'consent_pending') return

    const clientErrors: FieldErrors = {}
    if (!orderedImageIds) {
      clientErrors.imageIds =
        photosRef.current.length === 0
          ? '写真を 1まい 選んでください。'
          : 'すべての写真の準備が終わるまで、お待ちください。'
    }
    if (aiDraftNeedsReview) {
      clientErrors.general = '写真を変える前のAI下書きです。内容を確認してから保存してください。'
    }
    if (!trimmedTitle) clientErrors.title = 'タイトルを 入れてください。'
    if (!recordedAt) clientErrors.recordedAt = 'ひにちを 選んでください。'
    else if (recordedAt > todayIso) {
      clientErrors.recordedAt = 'ひにちは、きょうまでの日を 選んでください。'
    }
    if (Object.keys(clientErrors).length > 0) {
      errorFocusRequestedRef.current = true
      setFieldErrors(clientErrors)
      setTopMessage(quietStateCopy.record.validationFailed)
      return
    }
    if (!orderedImageIds) return

    saveInFlightRef.current = true
    setSubmitting(true)
    setFieldErrors({})
    setTopMessage(null)

    const requestBody: MemoryCreateRequest = {
      child_id: childId,
      title: trimmedTitle,
      body: body.trim() === '' ? null : body,
      recorded_at: recordedAt,
      weather: weather.trim() === '' ? null : weather,
      image_ids: orderedImageIds,
      ai_generated: hasAiGeneratedContent,
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

    try {
      await queryClient.cancelQueries({ queryKey: memoriesQueryKey })
      const rollback = optimisticAddMemoryToLists(queryClient, optimisticMemory)

      try {
        const created = await createMemoryMutation.mutateAsync({
          body: requestBody,
          idempotencyKey,
        })
        optimisticReplaceMemoryInLists(queryClient, optimisticId, created)
        recordDraftStore.clear()
        showToast({
          tone: 'success',
          title: quietStateCopy.record.saveDoneTitle,
          description: quietStateCopy.record.saveDoneDescription,
        })
        reportRecordProductEvent('memory_saved')
        router.push(`/memory/${created.id}?saved=1`)
        router.refresh()
      } catch (e) {
        rollback()
        void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
        if (isApiProblemError(e)) {
          switch (e.reason) {
            case 'validation_error': {
              const errors = extractFieldErrors(e.problem)
              const invalidIndexes = new Set(
                invalidImageIndexes(e.problem, photosRef.current.length),
              )
              if (invalidIndexes.size > 0) {
                const invalidPhotos = photosRef.current.filter((_, index) =>
                  invalidIndexes.has(index),
                )
                for (const photo of invalidPhotos) {
                  revokePhotoPreview(photo)
                  uploadRuntimeRef.current.delete(photo.clientId)
                }
                commitPhotos((current) => current.filter((_, index) => !invalidIndexes.has(index)))
                invalidateAiAfterPhotoChange()
              }
              errorFocusRequestedRef.current = true
              setFieldErrors(errors)
              setTopMessage(quietStateCopy.record.validationFailed)
              break
            }
            case 'unauthorized':
              router.push(signInPath(`${window.location.pathname}${window.location.search}`))
              return
            case 'memory_idempotency_conflict': {
              const nextIdempotencyKey = createRecordIdempotencyKey()
              setIdempotencyKey(nextIdempotencyKey)
              setTopMessage(quietStateCopy.record.saveConflictDescription)
              if (currentUserId) {
                recordDraftStore.save(currentUserId, {
                  idempotencyKey: nextIdempotencyKey,
                  title,
                  body,
                  parentNote,
                  recordedAt,
                  weather,
                  imageIds: orderedImageIds,
                  aiGenerated: hasAiGeneratedContent,
                  aiDraftNeedsReview,
                })
              }
              setSubmitting(false)
              window.setTimeout(() => primaryActionButtonRef.current?.focus(), 0)
              return
            }
            default:
              errorFocusRequestedRef.current = true
              setTopMessage(quietStateCopy.record.saveFailedDescription)
          }
        } else {
          errorFocusRequestedRef.current = true
          setTopMessage(quietStateCopy.record.saveFailedDescription)
        }
        setSubmitting(false)
      }
    } catch {
      setSubmitting(false)
      errorFocusRequestedRef.current = true
      setTopMessage(quietStateCopy.record.saveFailedDescription)
    } finally {
      saveInFlightRef.current = false
    }
  }

  if (phase === 'loading') {
    return (
      <Shell>
        <StatePanel className="w-full max-w-md py-16">
          <span className="text-ink-tertiary text-sm">{quietStateCopy.common.loading}</span>
        </StatePanel>
      </Shell>
    )
  }

  if (phase === 'no-child') {
    return (
      <Shell>
        <StatePanel className="w-full max-w-md">
          <h2 className="font-serif text-xl">さきに お子さんの こと、おしえてください</h2>
          <p className="text-ink-secondary leading-narrative mt-2 text-sm">
            記録を のこすには、お子さんの プロフィールが ひつようです。
          </p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/onboarding" prefetch={false}>
              プロフィールを ひらく
            </Link>
          </Button>
        </StatePanel>
      </Shell>
    )
  }

  if (phase === 'error') {
    return (
      <Shell>
        <StatePanel className="w-full max-w-md">
          <h2 className="font-serif text-xl">{quietStateCopy.common.openFailedTitle}</h2>
          <p className="text-ink-secondary leading-narrative mt-2 text-sm">
            {quietStateCopy.common.openFailedDescription}
          </p>
          <Button onClick={() => location.reload()} className="mt-6 w-full">
            {quietStateCopy.common.retryOpen}
          </Button>
        </StatePanel>
      </Shell>
    )
  }

  return (
    <RecordShell>
      <button
        type="button"
        onClick={onCancelClick}
        aria-label="やめて とじる"
        disabled={submitting}
        className="bg-elevated text-ink-secondary ring-elevated ease-organic tap-target absolute left-4 top-4 z-20 flex items-center gap-1 rounded-full px-4 py-2 font-serif text-sm ring-1 transition-transform active:scale-[0.97] disabled:cursor-wait disabled:opacity-50"
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
          しゃしんを 1〜5まい えらんで、ことばを そえます。
        </p>

        {primaryPhoto?.previewUrl ? (
          <PhotoMat
            data-testid="record-photo-mat-selected"
            className="mt-6 flex min-h-[240px] flex-1 items-center justify-center overflow-hidden"
          >
            <PhotoInner className="h-full max-h-[46dvh] w-full overflow-hidden">
              <NextImage
                src={primaryPhoto.previewUrl}
                alt="記録の表紙になる 1まい目のしゃしん"
                width={720}
                height={900}
                unoptimized
                className="h-full w-full object-cover"
              />
            </PhotoInner>
          </PhotoMat>
        ) : (
          <PhotoPlaceholder
            data-testid="record-photo-placeholder"
            icon={ImagePlus}
            title={
              photoAggregate.count > 0 ? `${photoAggregate.count}まい 選んでいます` : 'まずは 1まい'
            }
            description={
              photoAggregate.count > 0
                ? '1まい目が表紙になります。再読み込み後の写真は、このまま続けられます。'
                : 'うまく撮れた写真でなくても、残したい瞬間なら大丈夫です。'
            }
            className="mt-6 min-h-[240px] flex-1"
          />
        )}
      </section>

      <form
        onSubmit={onSubmit}
        noValidate
        data-testid="record-bottom-sheet"
        className="bg-elevated border-hairline shadow-lift sticky bottom-0 z-30 flex max-h-[68dvh] flex-col overflow-hidden rounded-t-[var(--radius-sheet)] border-t px-5 pt-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-hairline" aria-hidden="true" />

        <div
          data-testid="record-bottom-sheet-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pt-4"
        >
          {draftRestored ? (
            <p role="status" className="text-leaf text-sm">
              {quietStateCopy.record.draftRestored}
            </p>
          ) : null}

          {formErrorMessage ? (
            <div
              ref={recordErrorSummaryRef}
              id="record-error-summary"
              role="alert"
              tabIndex={-1}
              className="text-ink-secondary leading-narrative rounded-xl bg-warm px-4 py-3 text-sm"
            >
              {formErrorMessage}
            </div>
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            現在のステップ: {currentStepLabel}
          </p>
          <section aria-labelledby="record-progress-title">
            <h2 id="record-progress-title" className="meta-label mb-3">
              記録の進み具合
            </h2>
            <ol aria-label="記録の進行" className="grid grid-cols-3 gap-3 text-left text-[11px]">
              <RecordStep
                number={1}
                state={allPhotosConfirmed ? 'done' : 'current'}
                label="写真を選ぶ"
              />
              <RecordStep
                number={2}
                state={!allPhotosConfirmed ? 'upcoming' : draftComplete ? 'done' : 'current'}
                label="下書きを整える"
              />
              <RecordStep
                number={3}
                state={draftComplete ? 'current' : 'upcoming'}
                label="保存する"
              />
            </ol>
          </section>

          <PaperSlip data-testid="record-decision-cue">
            <p className="meta-label">{decisionCue.eyebrow}</p>
            <p className="text-ink-secondary leading-narrative mt-2 text-sm">{decisionCue.body}</p>
          </PaperSlip>

          <Label htmlFor="memory-photo" className="font-serif">
            写真{' '}
            <span aria-hidden="true" className="text-amber font-sans text-xs">
              必須
            </span>
          </Label>
          <span id="memory-photo-requirement" className="text-ink-tertiary text-xs">
            1〜5まい。上から順に記録へ並び、1まい目が表紙になります。
          </span>
          <Input
            ref={fileInputRef}
            id="memory-photo"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            onClick={resetPhotoInput}
            onChange={onFileSelected}
            className="sr-only"
            tabIndex={-1}
            aria-label="しゃしんを えらぶ"
            aria-required="true"
            aria-invalid={fieldErrors.imageIds ? true : undefined}
            aria-describedby={
              fieldErrors.imageIds
                ? 'memory-photo-requirement memory-photo-status memory-photo-error'
                : 'memory-photo-requirement memory-photo-status'
            }
          />

          {hasSelectedPhoto ? (
            <Button
              ref={photoActionButtonRef}
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={openPhotoPicker}
              disabled={photoReplacementLocked || (!photoAggregate.canAdd && !fieldErrors.imageIds)}
              aria-invalid={fieldErrors.imageIds ? true : undefined}
              aria-describedby={
                fieldErrors.imageIds
                  ? 'memory-photo-requirement memory-photo-status memory-photo-error'
                  : 'memory-photo-requirement memory-photo-status'
              }
            >
              {fieldErrors.imageIds
                ? 'しゃしんを えらびなおす'
                : photoAggregate.canAdd
                  ? 'しゃしんを 追加する'
                  : 'しゃしんは 5まい 選んでいます'}
            </Button>
          ) : null}

          <div id="memory-photo-status" className="min-h-4">
            {fieldErrors.imageIds ? (
              <p id="memory-photo-error" className="text-amber text-xs">
                {fieldErrors.imageIds}
              </p>
            ) : null}
            {photoSelectionMessage ? (
              <p className="text-ink-secondary mt-1 text-xs">{photoSelectionMessage}</p>
            ) : null}
          </div>

          <RecordPhotoList
            items={photos.map((photo) => ({
              clientId: photo.clientId,
              status: toPhotoListStatus(photo),
              statusText:
                photo.removalStatus === 'deleting'
                  ? '写真を削除しています'
                  : photo.removalStatus === 'failed'
                    ? '写真を削除できませんでした。入力した内容はそのままです。'
                    : photo.status === 'failed'
                      ? getUploadFailureMessage(photo.failureStage ?? 'prepare')
                      : undefined,
              retryLabel: photo.removalStatus === 'failed' ? '削除をもういちど' : undefined,
              removeDisabled: photo.removalStatus === 'deleting',
              preview: photo.previewUrl ? (
                <NextImage
                  src={photo.previewUrl}
                  alt=""
                  width={160}
                  height={160}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : undefined,
            }))}
            onMove={moveSelectedPhoto}
            onRemove={(clientId) => void removeSelectedPhoto(clientId)}
            onRetry={retryUpload}
            onAnnounce={setPhotoAnnouncement}
            statusAnnouncement={photoAnnouncement}
            emptyFocusRef={photoActionButtonRef}
            disabled={submitting}
          />

          {aiDraftNeedsReview ? (
            <PaperSlip data-testid="record-stale-ai-draft" className="border-amber border">
              <p className="font-serif text-sm text-ink">写真を変える前のAI下書きです</p>
              <p className="text-ink-secondary leading-narrative mt-1 text-xs">
                ことばは消していません。AIで作り直すか、内容を確認して保存へ進んでください。
              </p>
            </PaperSlip>
          ) : null}

          {allPhotosConfirmed ? (
            <>
              <PaperSlip data-testid="record-ai-decision" aria-busy={aiStatus === 'generating'}>
                <p className="text-ink-secondary font-serif text-sm">
                  {quietStateCopy.record.aiReady}
                </p>
                <div className="mt-4 flex flex-col gap-2" data-testid="record-parent-note">
                  <Label htmlFor="memory-parent-note" className="font-serif">
                    写真だけでは分からないこと (任意)
                  </Label>
                  <p
                    id="memory-parent-note-description"
                    className="text-ink-tertiary leading-narrative text-xs"
                  >
                    AIの下書きにだけ使います。記録には保存されません。
                  </p>
                  <Textarea
                    id="memory-parent-note"
                    value={parentNote}
                    onChange={(event) => setParentNote(event.target.value)}
                    disabled={aiStatus === 'generating'}
                    maxLength={PARENT_NOTE_MAX_LENGTH}
                    rows={3}
                    aria-describedby="memory-parent-note-description memory-parent-note-count"
                    placeholder="このとき初めて名前を呼んでくれました"
                    className="min-h-24"
                  />
                  <p id="memory-parent-note-count" className="text-ink-tertiary text-right text-xs">
                    {parentNote.length} / {PARENT_NOTE_MAX_LENGTH}
                  </p>
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
              </PaperSlip>

              <div className="flex flex-col gap-2">
                <Label htmlFor="memory-title" className="font-serif">
                  タイトル{' '}
                  <span aria-hidden="true" className="text-amber font-sans text-xs">
                    必須
                  </span>
                </Label>
                <Input
                  ref={titleInputRef}
                  id="memory-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    clearFieldError('title')
                  }}
                  disabled={aiStatus === 'generating'}
                  placeholder="はじめての すなあそび"
                  maxLength={100}
                  required
                  aria-invalid={fieldErrors.title ? true : undefined}
                  aria-describedby={fieldErrors.title ? 'memory-title-error' : undefined}
                />
                {fieldErrors.title ? (
                  <p id="memory-title-error" className="text-amber text-xs">
                    {fieldErrors.title}
                  </p>
                ) : null}
              </div>

              {storyPreview ? (
                <KeepsakePreview
                  aria-labelledby="memory-story-preview-title"
                  data-testid="record-story-preview"
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
                </KeepsakePreview>
              ) : (
                <p className="text-ink-tertiary leading-narrative text-center text-sm">
                  AI の下書き、または ひとことを添えて残せます。
                </p>
              )}

              <PaperSlip className="px-4 py-3">
                <details
                  ref={secondaryEditsRef}
                  data-testid="record-secondary-edits"
                  className="group"
                >
                  <summary className="tap-target text-ink-secondary flex cursor-pointer list-none items-center justify-between font-serif text-sm [&::-webkit-details-marker]:hidden">
                    ことば・日付を なおす
                    <span className="text-ink-tertiary text-xs group-open:hidden">ひらく</span>
                    <span className="text-ink-tertiary hidden text-xs group-open:inline">
                      とじる
                    </span>
                  </summary>
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="memory-body" className="font-serif">
                        ほんぶん (任意)
                      </Label>
                      <Textarea
                        ref={bodyInputRef}
                        id="memory-body"
                        value={body}
                        onChange={(e) => {
                          setBody(e.target.value)
                          clearFieldError('body')
                        }}
                        disabled={aiStatus === 'generating'}
                        maxLength={1000}
                        rows={4}
                        placeholder="あの しゅんかんの こと、ひとこと だけでも。"
                        aria-invalid={fieldErrors.body ? true : undefined}
                        aria-describedby={fieldErrors.body ? 'memory-body-error' : undefined}
                      />
                      {fieldErrors.body ? (
                        <p id="memory-body-error" className="text-amber text-xs">
                          {fieldErrors.body}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="memory-date" className="font-serif">
                          ひにち{' '}
                          <span aria-hidden="true" className="text-amber font-sans text-xs">
                            必須
                          </span>
                        </Label>
                        <Input
                          ref={recordedAtInputRef}
                          id="memory-date"
                          type="date"
                          value={recordedAt}
                          onChange={(e) => {
                            setRecordedAt(e.target.value)
                            clearFieldError('recordedAt')
                          }}
                          max={todayIso}
                          required
                          aria-invalid={fieldErrors.recordedAt ? true : undefined}
                          aria-describedby={
                            fieldErrors.recordedAt ? 'memory-date-error' : undefined
                          }
                        />
                        {fieldErrors.recordedAt ? (
                          <p id="memory-date-error" className="text-amber text-xs">
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
              </PaperSlip>
            </>
          ) : null}
        </div>

        <div
          data-testid="record-bottom-sheet-footer"
          className="bg-elevated border-hairline -mx-5 border-t px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        >
          <p id="record-footer-status" className="sr-only">
            {footerState.statusLabel}
          </p>
          <div
            aria-busy={
              footerState.primaryAction === 'uploading' ||
              footerState.primaryAction === 'generating-ai' ||
              footerState.primaryAction === 'saving'
            }
          >
            {footerState.primaryAction === 'save' || footerState.primaryAction === 'saving' ? (
              <Button
                ref={primaryActionButtonRef}
                type="submit"
                size="lg"
                disabled={footerState.primaryDisabled}
                aria-describedby="record-footer-status"
                className="w-full"
              >
                {footerState.primaryLabel}
              </Button>
            ) : footerState.primaryAction === 'confirm-ai-draft' ? (
              <Button
                ref={primaryActionButtonRef}
                type="button"
                size="lg"
                className="w-full"
                onClick={confirmStaleAiDraft}
                aria-describedby="record-footer-status"
              >
                {footerState.primaryLabel}
              </Button>
            ) : footerState.primaryAction === 'generate-ai' ||
              footerState.primaryAction === 'retry-ai' ? (
              <Button
                ref={primaryActionButtonRef}
                type="button"
                size="lg"
                className="w-full"
                onClick={requestAiGenerate}
                disabled={footerState.primaryDisabled}
                aria-describedby="record-footer-status"
              >
                {footerState.primaryLabel}
              </Button>
            ) : footerState.primaryAction === 'retry-upload' ? (
              <Button
                ref={primaryActionButtonRef}
                type="button"
                size="lg"
                className="w-full"
                onClick={() => retryUpload()}
                disabled={footerState.primaryDisabled}
                aria-describedby="record-footer-status"
              >
                {footerState.primaryLabel}
              </Button>
            ) : footerState.primaryAction === 'manual' ? (
              <Button
                ref={primaryActionButtonRef}
                type="button"
                size="lg"
                className="w-full"
                onClick={focusManualTitle}
                aria-describedby="record-footer-status"
              >
                {footerState.primaryLabel}
              </Button>
            ) : (
              <Button
                ref={(node) => {
                  primaryActionButtonRef.current = node
                  if (footerState.primaryAction === 'choose-photo') {
                    photoActionButtonRef.current = node
                  }
                }}
                type="button"
                size="lg"
                className="w-full"
                onClick={footerState.primaryAction === 'choose-photo' ? openPhotoPicker : undefined}
                disabled={footerState.primaryDisabled}
                aria-describedby={
                  footerState.primaryAction === 'choose-photo'
                    ? fieldErrors.imageIds
                      ? 'memory-photo-requirement memory-photo-error record-footer-status'
                      : 'memory-photo-requirement record-footer-status'
                    : 'record-footer-status'
                }
              >
                {footerState.primaryAction === 'choose-photo' && fieldErrors.imageIds
                  ? 'しゃしんを えらびなおす'
                  : footerState.primaryLabel}
              </Button>
            )}
          </div>
          {footerState.secondaryAction ? (
            <Button
              type="button"
              variant={footerState.secondaryAction === 'manual' ? 'outline' : 'ghost'}
              size={footerState.secondaryAction === 'manual' ? 'lg' : 'sm'}
              className={
                footerState.secondaryAction === 'manual'
                  ? 'border-ink bg-warm text-ink mt-2 w-full border-2 shadow-lift hover:bg-photo-mat active:bg-photo-mat'
                  : 'mt-1 w-full'
              }
              onClick={runFooterSecondaryAction}
            >
              {footerState.secondaryAction === 'manual' ? <PenLine aria-hidden="true" /> : null}
              {footerState.secondaryLabel}
            </Button>
          ) : null}
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
          onClose={() => void discardDraftAndClose()}
          pending={discarding}
        />
      ) : null}
    </RecordShell>
  )
}

function getRecordDecisionCue({
  uploaded,
  aiStatus,
  canSubmit,
  hasTitle,
  hasStory,
}: {
  uploaded: boolean
  aiStatus: AiStatus
  canSubmit: boolean
  hasTitle: boolean
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
  if (hasTitle) {
    return {
      eyebrow: '保存前の確認',
      body: 'ひにちを確認してください。保存を押すと、直す場所へ移動します。',
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
  'Anthropic の商用 API 条件と Hana のプライバシーレビューに沿って扱います。確認した範囲だけを表示します。'

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
            variant="outline"
            size="lg"
            onClick={onDecline}
            disabled={pending}
            className="border-ink bg-warm text-ink w-full border-2 shadow-lift hover:bg-photo-mat active:bg-photo-mat"
          >
            <PenLine aria-hidden="true" />
            AI を つかわないで、自分で書く
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

function RecordStep({
  number,
  state,
  label,
}: {
  number: number
  state: 'done' | 'current' | 'upcoming'
  label: string
}) {
  const status = state === 'done' ? '完了' : state === 'current' ? 'いまここ' : '未完了'

  return (
    <li
      aria-current={state === 'current' ? 'step' : undefined}
      className={`border-t-2 pt-2 ${
        state === 'upcoming' ? 'border-hairline text-ink-tertiary' : 'border-leaf text-ink'
      }`}
    >
      <span className="flex items-center gap-1 font-medium">
        {state === 'done' ? (
          <QuietIcon icon={Check} tone="primary" size="sm" active />
        ) : (
          <span aria-hidden="true">{number}</span>
        )}
        {label}
      </span>
      <span
        className={state === 'current' ? 'text-leaf-deep mt-1 block font-medium' : 'mt-1 block'}
      >
        {status}
      </span>
    </li>
  )
}

function CancelConfirmDialog({
  onKeep,
  onClose,
  pending,
}: {
  onKeep: () => void
  onClose: () => void
  pending: boolean
}) {
  return (
    <AccessibleDialog
      titleId="cancel-confirm-title"
      descriptionId="cancel-confirm-description"
      initialFocusId="cancel-confirm-keep"
      pending={pending}
      onClose={onKeep}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle id="cancel-confirm-title" className="font-serif text-xl">
            この下書きを 破棄しますか？
          </CardTitle>
          <CardDescription id="cancel-confirm-description" className="leading-narrative mt-2">
            このタブに保存した下書きと、なおした内容を削除して閉じます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            id="cancel-confirm-keep"
            type="button"
            size="lg"
            onClick={onKeep}
            disabled={pending}
            className="w-full"
          >
            もうすこし なおす
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={onClose}
            disabled={pending}
            className="border-amber bg-amber w-full border-2 text-white shadow-lift hover:bg-amber/90 hover:text-white active:bg-amber/90"
          >
            {pending ? '写真を整理して閉じています…' : '下書きを 破棄して閉じる'}
          </Button>
        </CardContent>
      </Card>
    </AccessibleDialog>
  )
}
