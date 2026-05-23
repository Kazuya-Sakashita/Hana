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

type FieldErrors = Partial<Record<'name' | 'birthdate' | 'avatar_url', string>>
type Phase = 'loading' | 'form' | 'already' | 'success' | 'error'

interface RegisteredChild {
  name: string
  birthdate: string
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

  const [phase, setPhase] = useState<Phase>('loading')
  const [existingChild, setExistingChild] = useState<RegisteredChild | null>(null)
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const canSubmit = name.trim().length > 0 && birthdate.length > 0 && !pending

  // 初期マウント時に既存の子どもプロフィールを取得し、状態を切替
  useEffect(() => {
    let cancelled = false
    const client = getBrowserApiClient()

    client
      .GET('/children')
      .then(({ data }) => {
        if (cancelled) return
        const first = data?.data?.[0]
        if (first) {
          setExistingChild({ name: first.name, birthdate: first.birthdate })
          setPhase('already')
        } else {
          setPhase('form')
        }
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
  }, [router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})
    setSubmitMessage(null)

    const trimmedName = name.trim()
    const client = getBrowserApiClient()
    try {
      await client.POST('/children', {
        body: { name: trimmedName, birthdate, avatar_url: null },
      })
      // 短い成功画面 → ホームへ
      setExistingChild({ name: trimmedName, birthdate })
      setPhase('success')
      setTimeout(() => router.push('/'), 1500)
    } catch (e) {
      if (isApiProblemError(e)) {
        switch (e.reason) {
          case 'validation_error':
            setFieldErrors(extractFieldErrors(e.problem))
            break
          case 'child_limit_reached':
            // 別タブで登録した等の race。最新状態で再描画
            setExistingChild({ name: trimmedName, birthdate })
            setPhase('already')
            return
          case 'unauthorized':
            router.push('/sign-in')
            return
          default:
            setSubmitMessage(
              `うまく ほぞんできませんでした。もういちど ためしてみてください。 (${e.reason})`,
            )
        }
      } else {
        setSubmitMessage('うまく つうしんできませんでした。もういちど ためしてみてください。')
      }
      setPending(false)
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

  if (phase === 'already' && existingChild) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-2xl">
              {existingChild.name} ちゃんの ページは すでに あります
            </CardTitle>
            <CardDescription className="mt-2">
              うまれたひ: {existingChild.birthdate}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/">ホームへ</Link>
            </Button>
            <p className="text-ink-tertiary text-center text-xs">
              プロフィールは あとから せってい で かえられます。
            </p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (phase === 'success' && existingChild) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-2xl">
              {existingChild.name} ちゃん、はじめまして
            </CardTitle>
            <CardDescription className="mt-2">これが、ふたりの 1ページ目です。</CardDescription>
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
          <CardTitle className="font-serif text-2xl">お子さんのこと、おしえてください</CardTitle>
          <CardDescription className="mt-2">あとから いつでも かえられます。</CardDescription>
        </CardHeader>
        <CardContent>
          {submitMessage ? (
            <div
              role="alert"
              className="text-ink-secondary mb-6 rounded-xl bg-warm px-4 py-3 text-sm leading-narrative"
            >
              {submitMessage}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="child-name" className="font-serif">
                なまえ
              </Label>
              <Input
                id="child-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="はると"
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
              {pending ? 'ほぞん しています…' : 'つづける'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      {children}
    </main>
  )
}
