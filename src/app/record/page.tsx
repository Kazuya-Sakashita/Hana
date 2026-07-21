'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChildrenQuery } from '@/features/children/client/use-children'
import { useCreateMemoryMutation } from '@/features/memories/client/use-memories'
import { useCurrentUserQuery, useSetAiConsentMutation } from '@/features/me/client/use-current-user'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'

type Phase = 'loading' | 'no-child' | 'form' | 'success' | 'error'
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
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [submissionPhase, setSubmissionPhase] = useState<'idle' | 'success'>('idle')
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
  const currentUserQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const setAiConsentMutation = useSetAiConsentMutation()
  const createMemoryMutation = useCreateMemoryMutation()

  const selectedChild = childrenQuery.data?.data[0] ?? null
  const childId = selectedChild?.id ?? null
  const childName = selectedChild?.name ?? ''
  const aiConsentAt = aiConsentAtOverride ?? currentUserQuery.data?.ai_consent_at ?? null
  const phase: Phase =
    submissionPhase === 'success'
      ? 'success'
      : currentUserQuery.isPending || childrenQuery.isPending
        ? 'loading'
        : currentUserQuery.isError || childrenQuery.isError
          ? 'error'
          : selectedChild
            ? 'form'
            : 'no-child'
  const canSubmit =
    !!uploadedImage && title.trim().length > 0 && recordedAt.length > 0 && !submitting
  const canGenerateAi = !!uploadedImage && aiStatus !== 'generating' && !aiQuotaExceeded
  const hasUnsavedChanges = !!uploadedImage || title.trim().length > 0 || body.trim().length > 0

  function onCancelClick() {
    if (hasUnsavedChanges) {
      setCancelDialogOpen(true)
    } else {
      router.push('/')
    }
  }

  useEffect(() => {
    const error = currentUserQuery.error ?? childrenQuery.error
    if (isApiProblemError(error) && error.reason === 'unauthorized') {
      router.push('/sign-in')
    }
  }, [childrenQuery.error, currentUserQuery.error, router])

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
      if (!presigned.data) throw new Error('signed URL を取得できませんでした')
      const { presigned_url, storage_key } = presigned.data

      setUploadStatus('uploading')
      const putRes = await fetch(presigned_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      })
      if (!putRes.ok) {
        throw new Error(`Storage への アップロードに しっぱいしました (HTTP ${putRes.status})`)
      }

      setUploadStatus('confirming')
      const confirmed = await client.POST('/uploads/confirm', {
        body: { storage_key, width, height, file_size: blob.size },
      })
      if (!confirmed.data) throw new Error('アップロードの かくにんに しっぱいしました')

      setUploadedImage({ id: confirmed.data.id, previewUrl: filePreviewUrl ?? '' })
      setUploadStatus('done')
    } catch (e: unknown) {
      setUploadStatus('failed')
      const msg = e instanceof Error ? e.message : 'うまく アップロードできませんでした'
      setUploadError(msg)
    }
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
            setAiError(
              '今月の AI せいせい かいすうの じょうげんに たっしました。らいげつ また つかえます。',
            )
            return
          default:
            setAiStatus('failed')
            setAiError(`AI せいせいに しっぱい しました (${e.reason})`)
        }
      } else {
        setAiStatus('failed')
        setAiError('AI せいせいに しっぱい しました')
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
      setAiError('どういの ほぞんに しっぱい しました')
    }
  }

  function declineAiConsent() {
    setAiStatus('idle')
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uploadedImage || !childId) return
    setSubmitting(true)
    setFieldErrors({})
    setTopMessage(null)

    const trimmedTitle = title.trim()
    const wasAiGenerated = aiStatus === 'done'
    try {
      await createMemoryMutation.mutateAsync({
        child_id: childId,
        title: trimmedTitle,
        body: body.trim() === '' ? null : body,
        recorded_at: recordedAt,
        weather: weather.trim() === '' ? null : weather,
        image_ids: [uploadedImage.id],
        ai_generated: wasAiGenerated,
      })
      setSubmissionPhase('success')
      setTimeout(() => router.push('/album'), 1500)
    } catch (e) {
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'validation_error':
            setFieldErrors(extractFieldErrors(e.problem))
            break
          case 'unauthorized':
            router.push('/sign-in')
            return
          default:
            setTopMessage(`うまく ほぞんできませんでした。 (${e.reason})`)
        }
      } else {
        setTopMessage('うまく つうしんできませんでした。もういちど ためしてみてください。')
      }
      setSubmitting(false)
    }
  }

  if (phase === 'loading') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-16">
            <span className="text-ink-tertiary text-sm">よみこんでいます…</span>
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
              <Link href="/onboarding">プロフィールを ひらく</Link>
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
            <CardTitle className="font-serif text-xl">うまく ひらけませんでした</CardTitle>
            <CardDescription className="mt-2">
              ネットワークの ちょうしを たしかめて、もういちど ためしてみてください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => location.reload()} className="w-full">
              もういちど ひらく
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (phase === 'success') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-2xl">
              {childName} ちゃんの きょうが、のこりました
            </CardTitle>
            <CardDescription className="mt-2">アルバムへ いどう しています…</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <button
        type="button"
        onClick={onCancelClick}
        aria-label="やめて とじる"
        className="bg-elevated text-ink-secondary ring-elevated ease-organic absolute left-4 top-4 flex items-center gap-1 rounded-full px-3 py-2 font-serif text-sm ring-1 transition-transform active:scale-[0.97]"
      >
        <span aria-hidden="true">‹</span>
        やめる
      </button>
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-2xl">
            きょうの {childName} ちゃんを のこす
          </CardTitle>
          <CardDescription className="mt-2">
            しゃしんを 1まい えらんで、ことばを そえます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topMessage ? (
            <div
              role="alert"
              className="text-ink-secondary leading-narrative mb-6 rounded-xl bg-warm px-4 py-3 text-sm"
            >
              {topMessage}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="memory-photo" className="font-serif">
                しゃしん
              </Label>
              <Input
                id="memory-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={onFileSelected}
              />
              {uploadStatus === 'preparing' ? (
                <p className="text-ink-tertiary text-xs">じゅんびしています…</p>
              ) : null}
              {uploadStatus === 'uploading' ? (
                <p className="text-ink-tertiary text-xs">アップロードしています…</p>
              ) : null}
              {uploadStatus === 'confirming' ? (
                <p className="text-ink-tertiary text-xs">かくにんしています…</p>
              ) : null}
              {uploadStatus === 'done' ? (
                <p className="text-leaf text-xs">アップロード できました</p>
              ) : null}
              {uploadStatus === 'failed' && uploadError ? (
                <p className="text-amber text-xs">{uploadError}</p>
              ) : null}
              {filePreviewUrl && file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreviewUrl}
                  alt="えらんだ しゃしん"
                  className="border-hairline mt-2 max-h-48 w-full rounded-xl border object-cover"
                />
              ) : null}
              {fieldErrors.imageIds ? (
                <p className="text-amber text-xs">{fieldErrors.imageIds}</p>
              ) : null}
            </div>

            {uploadedImage ? (
              <div className="bg-warm rounded-xl p-4">
                <p className="text-ink-secondary font-serif text-sm">
                  AI に、ことばを かんがえて もらえます。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="mt-3 w-full"
                  onClick={callAiGenerate}
                  disabled={!canGenerateAi}
                >
                  {aiStatus === 'generating'
                    ? '○○ちゃんの ページを、つくっています…'.replace('○○', childName)
                    : aiStatus === 'done'
                      ? 'もういちど AI に たのむ'
                      : 'AI で つくる'}
                </Button>
                {aiStatus === 'done' ? (
                  <p className="text-leaf mt-2 text-xs">
                    タイトルと ほんぶんに、ていあんを いれました。じゆうに なおせます。
                  </p>
                ) : null}
                {aiError ? <p className="text-amber mt-2 text-xs">{aiError}</p> : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="memory-title" className="font-serif">
                タイトル
              </Label>
              <Input
                id="memory-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="はじめての すなあそび"
                maxLength={100}
              />
              {fieldErrors.title ? <p className="text-amber text-xs">{fieldErrors.title}</p> : null}
            </div>

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
              {fieldErrors.body ? <p className="text-amber text-xs">{fieldErrors.body}</p> : null}
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
                  <p className="text-amber text-xs">{fieldErrors.recordedAt}</p>
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

            <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
              {submitting ? 'ほぞん しています…' : 'のこす'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {aiStatus === 'consent_pending' ? (
        <AiConsentDialog
          childName={childName}
          aiConsentAt={aiConsentAt}
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
    </Shell>
  )
}

function AiConsentDialog({
  childName,
  aiConsentAt,
  onAccept,
  onDecline,
}: {
  childName: string
  aiConsentAt: string | null
  onAccept: () => void
  onDecline: () => void
}) {
  // 既に同意済みなのに 403 ai_consent_required が返ってきた場合は、サーバとローカルの状態差。
  // ユーザーには通常通り同意ダイアログを見せる (idempotent endpoint なので安全)。
  void aiConsentAt
  // 同意ダイアログは「外側クリックで閉じる」を意図的に **無効**。
  // 明示的に「どういして、つくる」または「AI を つかわない」を押させる (consent UX の鉄則)。
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-xl">あなたの しゃしんを、ことばに します</CardTitle>
          <CardDescription className="leading-narrative mt-2">
            Hana は、{childName} ちゃんの しゃしんを そとの AI に いちじてきに おくり、 ぶんしょうの
            ていあんを もらいます。 なまえと月齢は おくりますが、たんじょうびと じゅうしょは
            おくりません。 学習にも つかわれません。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" size="lg" onClick={onAccept} className="w-full">
            どういして、つくる
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onDecline} className="w-full">
            AI を つかわない
          </Button>
          <p className="text-ink-tertiary text-center text-xs">
            せっていから いつでも かえられます。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-canvas relative flex min-h-dvh items-center justify-center px-6 py-12">
      {children}
    </main>
  )
}

function CancelConfirmDialog({ onKeep, onClose }: { onKeep: () => void; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-confirm-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle id="cancel-confirm-title" className="font-serif text-xl">
            ほぞんせずに とじますか？
          </CardTitle>
          <CardDescription className="leading-narrative mt-2">
            なおした ぶんは うしなわれます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" size="lg" onClick={onKeep} className="w-full">
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
    </div>
  )
}
