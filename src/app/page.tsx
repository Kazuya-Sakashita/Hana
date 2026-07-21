import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { HomeGreeting } from '@/components/home-greeting'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'

// V0 prompt §5.2 ホーム画面 (ISSUE-026: Server Component 化 + Suspense streaming)
//   - 認証チェックだけ最上位で実行 (失敗時 redirect)
//   - shell + skeleton を即送出 → FCP を早める
//   - データ依存部分は Suspense 内で async fetch → HTML 同梱で LCP は維持

export const dynamic = 'force-dynamic'

function daysBetween(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const t = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.max(0, Math.floor((t - f) / dayMs))
}

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        {/* Top bar: Greeting は即出る (Client Component), avatar は Suspense でストリーム */}
        <header className="mb-8 flex items-center justify-between">
          <HomeGreeting />
          <Suspense fallback={<AvatarPlaceholder />}>
            <HomeAvatar userId={user.id} />
          </Suspense>
        </header>
        {/* Body: hero + carousel + stat */}
        <Suspense fallback={<HomeBodySkeleton />}>
          <HomeBody userId={user.id} />
        </Suspense>
      </div>
    </main>
  )
}

async function HomeAvatar({ userId }: { userId: string }) {
  // 軽量 query: child.name のみ。 child 不在は HomeBody が onboarding に redirect するので
  // ここでは null を返して空にしておく (placeholder のまま残る)。
  const child = await prisma.child.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { name: true },
  })
  if (!child) return null
  const initial = Array.from(child.name)[0] ?? '?'
  return (
    <Link
      href="/settings"
      prefetch={true}
      aria-label={`${child.name} の せってい`}
      className="bg-warm text-sakura-deep ring-elevated flex h-10 w-10 items-center justify-center rounded-full font-serif text-base ring-2"
    >
      {initial}
    </Link>
  )
}

function AvatarPlaceholder() {
  return <div className="bg-warm h-10 w-10 animate-pulse rounded-full" aria-hidden="true" />
}

async function HomeBody({ userId }: { userId: string }) {
  // 並列フェッチ: child + memories(limit=5)
  const [child, memoriesResult] = await Promise.all([
    prisma.child.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    fetchMemoriesWithCovers({ userId, limit: 5 }),
  ])
  if (!child) redirect('/onboarding')

  const memories = memoriesResult.items
  const ageLabel = formatAgeLabel(computeAge(child.birthdate, new Date()))
  const togetherDays = daysBetween(child.createdAt, new Date())

  return (
    <>
      {/* Hero card */}
      <Link
        href="/record"
        prefetch={false}
        className="ease-organic block transition-transform active:scale-[0.97]"
      >
        <Card className="bg-elevated shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-xl leading-snug">
              今日の {child.name} ちゃんを、のこしませんか
            </CardTitle>
            <CardDescription className="text-ink-secondary mt-2 text-sm">
              しゃしん 1まいから、30びょうで かんりょうします
            </CardDescription>
            <p className="text-sakura-deep mt-3 text-right text-xl" aria-hidden="true">
              →
            </p>
          </CardHeader>
        </Card>
      </Link>

      {memories.length === 0 ? (
        <section className="mt-10 flex flex-col items-center text-center">
          <span className="text-hairline mb-6 text-7xl" aria-hidden="true">
            ❀
          </span>
          <p className="text-ink-secondary leading-narrative font-serif text-base">
            {child.name} ちゃんとの 1まいめを、
            <br />
            ひらきましょう
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/record" prefetch={false}>
              はじめての ページを つくる
            </Link>
          </Button>
        </section>
      ) : (
        <>
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <p className="meta-label">さいきんの ページ</p>
              <Link href="/album" prefetch={true} className="text-ink-tertiary text-xs">
                もっとみる →
              </Link>
            </div>
            <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
              {memories.map((m) => {
                const url = m.coverThumbnailUrl
                return (
                  <li key={m.id} className="w-[140px] shrink-0">
                    <Link
                      href={`/memory/${m.id}`}
                      prefetch={true}
                      className="ease-organic block transition-transform active:scale-[0.97]"
                    >
                      {typeof url === 'string' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={m.title}
                          className="border-hairline aspect-[4/5] w-full rounded-2xl border object-cover"
                        />
                      ) : (
                        <div className="bg-warm text-sakura-deep border-hairline flex aspect-[4/5] w-full items-center justify-center rounded-2xl border text-3xl">
                          ❀
                        </div>
                      )}
                      <p className="text-ink mt-2 line-clamp-2 font-serif text-sm leading-tight">
                        {m.title}
                      </p>
                    </Link>
                  </li>
                )
              })}
              <li className="w-[140px] shrink-0">
                <Link
                  href="/album"
                  prefetch={true}
                  className="bg-warm text-ink-secondary border-hairline ease-organic flex aspect-[4/5] w-full items-center justify-center rounded-2xl border font-serif text-sm transition-transform active:scale-[0.97]"
                >
                  もっとみる →
                </Link>
              </li>
            </ul>
          </section>

          <section className="mt-10">
            <p className="meta-label mb-3">これまでの あゆみ</p>
            <div className="bg-elevated border-hairline grid grid-cols-3 divide-x divide-[var(--hairline)] rounded-2xl border">
              <Stat number={String(memories.length)} unit="ページ" />
              <Stat number={ageLabel.replace('生後 ', '')} unit={`${child.name} ちゃん`} />
              <Stat number={String(togetherDays)} unit="日 いっしょ" />
            </div>
          </section>
        </>
      )}
    </>
  )
}

function HomeBodySkeleton() {
  // hero card と carousel の **形状一致** で CLS ゼロを維持。
  return (
    <>
      <div
        className="bg-warm h-32 w-full animate-pulse rounded-[var(--radius)]"
        aria-hidden="true"
      />
      <section className="mt-10">
        <div className="bg-warm mb-3 h-4 w-24 animate-pulse rounded" aria-hidden="true" />
        <ul className="-mx-6 flex gap-3 px-6 pb-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="w-[140px] shrink-0" aria-hidden="true">
              <div className="bg-warm aspect-[4/5] w-full animate-pulse rounded-2xl" />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Stat({ number, unit }: { number: string; unit: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-5">
      <span className="text-ink tabular-nums-light text-2xl">{number}</span>
      <span className="text-ink-tertiary mt-1 text-center text-[11px]">{unit}</span>
    </div>
  )
}
