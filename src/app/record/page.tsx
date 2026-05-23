'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError, type ProblemDetails } from '@/lib/api/error'

type Phase = 'loading' | 'no-child' | 'form' | 'success' | 'error'
type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'done' | 'failed'

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

// Canvas で再エンコードして EXIF を削除する。
// HEIC は Safari でしか描画できないが、その場合 onerror で失敗する。
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

    // PNG は PNG のまま、その他は JPEG に正規化 (画質 92%)
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
  const [phase, setPhase] = useState<Phase>('loading')
  const [childId, setChildId] = useState<string | null>(null)
  const [childName, setChildName] = useState<string>('')

  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [recordedAt, setRecordedAt] = useState('')
  const [weather, setWeather] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [topMessage, setTopMessage] = useState<string | null>(null)

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const canSubmit =
    !!uploadedImage && title.trim().length > 0 && recordedAt.length > 0 && !submitting

  // 初期マウント: 子どもプロフィールを取得
  useEffect(() => {
    let cancelled = false
    const client = getBrowserApiClient()
    client
      .GET('/children')
      .then(({ data }) => {
        if (cancelled) return
        const first = data?.data?.[0]
        if (!first) {
          setPhase('no-child')
          return
        }
        setChildId(first.id)
        setChildName(first.name)
        setRecordedAt(todayIso)
        setPhase('form')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (isApiProblemError(e) && e.reason === 'unauthorized') {
          router.push('/sign-in')
          return
        }
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [router, todayIso])

  // file が変わったらプレビュー URL の cleanup
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

    try {
      const { blob, contentType, width, height } = await reencodeImage(f)

      setUploadStatus('preparing')
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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uploadedImage || !childId) return
    setSubmitting(true)
    setFieldErrors({})
    setTopMessage(null)

    const client = getBrowserApiClient()
    try {
      await client.POST('/memories', {
        body: {
          child_id: childId,
          title: title.trim(),
          body: body.trim() === '' ? null : body,
          recorded_at: recordedAt,
          weather: weather.trim() === '' ? null : weather,
          image_ids: [uploadedImage.id],
          ai_generated: false,
        },
      })
      setPhase('success')
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

  // === 表示分岐 ===

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

  // phase === 'form'
  return (
    <Shell>
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
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-canvas flex min-h-dvh items-center justify-center px-6 py-12">
      {children}
    </main>
  )
}
