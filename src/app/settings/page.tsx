'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'
import { useChildrenQuery } from '@/features/children/client/use-children'
import { useCurrentUserQuery } from '@/features/me/client/use-current-user'

// 最小スコープの設定画面 (ISSUE-014):
//   - 親のメール表示
//   - 子どもプロフィール (名前 + 月齢)
//   - サインアウト
// 完全版 (V0 §5.14) はリリース後の polish ISSUE で。

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
      <main className="bg-canvas min-h-dvh px-6 pb-24 pt-12">
        <p className="text-ink-tertiary text-center text-sm">よみこんでいます…</p>
      </main>
    )
  }

  if (meQuery.isError || childrenQuery.isError) {
    return (
      <main className="bg-canvas min-h-dvh px-6 pb-24 pt-12">
        <Card>
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
      </main>
    )
  }

  const me = meQuery.data
  const child = childrenQuery.data.data[0] ?? null
  const ageLabel = child
    ? formatAgeLabel(computeAge(new Date(`${child.birthdate}T00:00:00Z`), new Date()))
    : null

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-24 pt-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-serif text-2xl">せってい</h1>

        <section className="mt-8 flex flex-col gap-6">
          {child ? (
            <Card>
              <CardHeader>
                <p className="meta-label">お子さん</p>
                <CardTitle className="font-serif mt-2 text-xl">{child.name}</CardTitle>
                {ageLabel ? (
                  <CardDescription className="text-ink-secondary mt-1 text-sm">
                    {ageLabel}
                  </CardDescription>
                ) : null}
              </CardHeader>
            </Card>
          ) : null}

          {me ? (
            <Card>
              <CardHeader>
                <p className="meta-label">アカウント</p>
                <CardTitle className="font-serif mt-2 break-all text-base font-normal">
                  {me.email ?? '(メール 未設定)'}
                </CardTitle>
                <CardDescription className="text-ink-tertiary mt-1 text-xs">
                  Google アカウントで サインインしています
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <p className="meta-label">そのほか</p>
              <CardDescription className="text-ink-secondary mt-2 leading-narrative text-sm">
                プロフィール編集 / 通知 / 家族と わかちあう / Hana Plus などは ちかぢか たいおう
                します。
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="pt-4">
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
      </div>
    </main>
  )
}
