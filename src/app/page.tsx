import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Camera, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HomeGreeting } from '@/components/home-greeting'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'

// ISSUE-056: Quiet Heirloom home.
// Auth shell and streamed body stay separate so the first paint remains light.

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
      className="bg-warm text-sakura-deep ring-elevated tap-target flex h-11 w-11 items-center justify-center rounded-full font-serif text-base ring-2"
    >
      {initial}
    </Link>
  )
}

function AvatarPlaceholder() {
  return <div className="bg-warm h-11 w-11 animate-pulse rounded-full" aria-hidden="true" />
}

async function HomeBody({ userId }: { userId: string }) {
  const [child, memoriesResult, memoryCount] = await Promise.all([
    prisma.child.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { name: true, birthdate: true },
    }),
    fetchMemoriesWithCovers({ userId, limit: 5 }),
    prisma.memory.count({ where: { userId, deletedAt: null } }),
  ])
  if (!child) redirect('/onboarding')

  const memories = memoriesResult.items
  const ageLabel = formatAgeLabel(computeAge(child.birthdate, new Date()))
  const togetherDays = daysBetween(child.birthdate, new Date())

  return (
    <div className="space-y-10">
      <section
        aria-labelledby="home-primary-action"
        className="paper-surface overflow-hidden rounded-[var(--radius)] px-5 py-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="meta-label">ただいま</p>
            <h1 id="home-primary-action" className="mt-3 font-serif text-2xl leading-snug">
              また、ここに
              <br />
              しまいましょう
            </h1>
            <p className="text-ink-secondary mt-3 text-sm leading-7">
              写真1まいから、AIの下書きまで<span className="whitespace-nowrap">30秒</span>
              。保存前に、ことばを整えられます。
            </p>
          </div>
          <div
            className="photo-mat flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            aria-hidden="true"
          >
            <BookOpen className="text-sakura-deep size-6" />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/record" prefetch={false}>
              <Camera className="size-4" aria-hidden="true" />
              写真からページをつくる
            </Link>
          </Button>
          {memories.length > 0 ? (
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/album" prefetch={true}>
                <BookOpen className="size-4" aria-hidden="true" />
                アルバムをひらく
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="text-ink-tertiary mt-4 text-center text-xs leading-6">
          ひとことだけでも、静かに残せます。
        </p>
      </section>

      {memories.length === 0 ? (
        <section className="photo-mat rounded-[var(--radius)] px-5 py-8 text-center">
          <p className="meta-label">はじめのページ</p>
          <h2 className="mt-3 font-serif text-xl leading-snug">
            最初のページを、
            <br />
            ここにしまえます
          </h2>
          <p className="text-ink-secondary mx-auto mt-3 max-w-[18rem] text-sm leading-7">
            {child.name} ちゃんとの 1まいめを、ありのままの写真から。
          </p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/record" prefetch={false}>
              <Camera className="size-4" aria-hidden="true" />
              はじめてのページをつくる
            </Link>
          </Button>
        </section>
      ) : (
        <>
          <section aria-labelledby="home-keepsake-pages">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="meta-label">アルバム</p>
                <h2 id="home-keepsake-pages" className="mt-1 font-serif text-lg">
                  しまってある ページ
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="px-3">
                <Link href="/album" prefetch={true}>
                  アルバムへ
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="-mx-6 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 py-2">
              {memories.map((m) => {
                const url = m.coverThumbnailUrl
                return (
                  <li key={m.id} className="w-[148px] shrink-0 snap-start">
                    <Link
                      href={`/memory/${m.id}`}
                      className="paper-surface ease-organic block rounded-[18px] p-2 transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
                    >
                      {typeof url === 'string' ? (
                        <div className="photo-mat rounded-[14px] p-1">
                          <Image
                            src={url}
                            alt=""
                            width={140}
                            height={175}
                            sizes="140px"
                            className="aspect-[4/5] w-full rounded-[10px] object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="photo-mat flex aspect-[4/5] w-full items-center justify-center rounded-[14px]"
                          aria-hidden="true"
                        >
                          <BookOpen className="text-sakura-deep size-7" />
                        </div>
                      )}
                      <p className="text-ink mt-3 line-clamp-2 min-h-10 font-serif text-sm leading-5">
                        {m.title}
                      </p>
                    </Link>
                  </li>
                )
              })}
              <li className="w-[148px] shrink-0 snap-start">
                <Link
                  href="/album"
                  prefetch={true}
                  className="photo-mat ease-organic flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-[18px] px-4 text-center font-serif text-sm transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
                >
                  まえのページも
                  <span className="text-sakura-deep inline-flex items-center gap-1">
                    ひらく
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            </ul>
          </section>

          <section aria-labelledby="home-gentle-stats">
            <h2 id="home-gentle-stats" className="meta-label mb-3">
              この場所の あゆみ
            </h2>
            <dl className="grid grid-cols-3 gap-2">
              <Stat number={String(memoryCount)} label="しまったページ" />
              <Stat number={ageLabel.replace('生後 ', '')} label="いまの月齢" />
              <Stat number={String(togetherDays)} label="一緒に過ごした日数" unit="日" />
            </dl>
          </section>
        </>
      )}
    </div>
  )
}

function HomeBodySkeleton() {
  return (
    <div className="space-y-10">
      <div
        className="bg-warm h-56 w-full animate-pulse rounded-[var(--radius)]"
        aria-hidden="true"
      />
      <section>
        <div className="bg-warm mb-3 h-8 w-36 animate-pulse rounded" aria-hidden="true" />
        <ul className="-mx-6 flex gap-3 px-6 py-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="w-[148px] shrink-0" aria-hidden="true">
              <div className="bg-warm aspect-[4/5] w-full animate-pulse rounded-[18px]" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Stat({ number, label, unit }: { number: string; label: string; unit?: string }) {
  return (
    <div className="paper-surface flex min-h-28 flex-col items-center justify-center rounded-2xl px-2 py-4 text-center">
      <dt className="text-ink-tertiary max-w-full break-words text-[11px] leading-5 [overflow-wrap:anywhere]">
        {label}
      </dt>
      <dd className="text-ink mt-2 flex flex-wrap items-baseline justify-center gap-1">
        <span className="tabular-nums-light text-2xl leading-none">{number}</span>
        {unit ? <span className="text-ink-tertiary text-xs">{unit}</span> : null}
      </dd>
    </div>
  )
}
