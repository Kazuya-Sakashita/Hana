import Image from 'next/image'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Camera, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HomeGreeting } from '@/components/home-greeting'
import { QuietIcon } from '@/components/product/icons'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoriesWithCovers, type MemoryListItem } from '@/features/memories/server/queries'

// ISSUE-056: Quiet Heirloom home.
// Auth shell and streamed body stay separate so the first paint remains light.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'ホーム | Hana',
  description: 'Hana のホーム',
}

function daysBetween(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const t = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.max(0, Math.floor((t - f) / dayMs))
}

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/lp')

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
        {/* Body: hero + album summary + stat */}
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
    fetchMemoriesWithCovers({ userId, limit: 1 }),
    prisma.memory.count({ where: { userId, deletedAt: null } }),
  ])
  if (!child) redirect('/onboarding')

  const memories = memoriesResult.items
  const featuredMemory = memories[0] ?? null
  const ageLabel = formatAgeLabel(computeAge(child.birthdate, new Date()))
  const togetherDays = daysBetween(child.birthdate, new Date())

  return (
    <div className="space-y-10">
      <section aria-labelledby="home-primary-action" className="space-y-5">
        <div className="space-y-4">
          <div>
            <p className="meta-label break-words [overflow-wrap:anywhere]">
              {child.name} ちゃんのアルバム
            </p>
            <h1 id="home-primary-action" className="mt-3 font-serif text-2xl leading-snug">
              {featuredMemory ? (
                <>
                  また、ここに
                  <br />
                  しまいましょう
                </>
              ) : (
                <>
                  最初の1まいを、
                  <br />
                  ここにしまえます
                </>
              )}
            </h1>
            <p className="text-ink-secondary mt-3 text-sm leading-7">
              AIの下書きか、自分のひとことを選べます。保存前に、ことばを整えられます。
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/record" prefetch={false}>
                <Camera className="size-4" aria-hidden="true" />
                {featuredMemory ? '写真からページをつくる' : 'はじめてのページをつくる'}
              </Link>
            </Button>
          </div>
          <p className="text-ink-tertiary text-center text-xs leading-6">
            ひとことだけでも、静かに残せます。
          </p>
        </div>

        <FeaturedPhotoMat memory={featuredMemory} />
      </section>

      {memories.length === 0 ? (
        <section
          aria-labelledby="home-empty-state"
          className="paper-surface rounded-[var(--radius-paper-slip)] px-5 py-5"
        >
          <h2 id="home-empty-state" className="meta-label">
            小さな余白
          </h2>
          <p className="text-ink-secondary mt-3 text-sm leading-7">
            <span className="break-words [overflow-wrap:anywhere]">{child.name}</span>{' '}
            ちゃんとの1まいめを、ありのままの写真から。
          </p>
        </section>
      ) : (
        <>
          <HomeAlbumSummary memoryCount={memoryCount} />
          <HomeGentleStats ageLabel={ageLabel} togetherDays={togetherDays} />
        </>
      )}
    </div>
  )
}

function HomeAlbumSummary({ memoryCount }: { memoryCount: number }) {
  return (
    <section aria-labelledby="home-album-summary">
      <Link
        href="/album"
        prefetch={true}
        className="paper-surface ease-organic flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-paper-slip)] px-5 py-4 transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
      >
        <div className="min-w-0">
          <p className="meta-label">アルバム</p>
          <h2 id="home-album-summary" className="text-ink mt-1 font-serif text-lg leading-7">
            {memoryCount}ページ、しまってあります
          </h2>
          <p className="text-ink-tertiary mt-1 text-xs leading-5">
            月ごとに、これまでのページを見返せます。
          </p>
        </div>
        <QuietIcon icon={ChevronRight} tone="primary" className="shrink-0" />
      </Link>
    </section>
  )
}

function FeaturedPhotoMat({ memory }: { memory: MemoryListItem | null }) {
  const coverUrl = memory?.coverThumbnailUrl

  if (!memory) {
    return (
      <div
        data-testid="home-first-view-photo-mat"
        className="photo-mat rounded-[var(--radius-sheet)] p-2"
      >
        <div className="bg-paper-slip/70 flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius-photo-inner)] px-8 text-center">
          <div className="space-y-3">
            <BookOpen className="text-sakura-deep mx-auto size-8" aria-hidden="true" />
            <p className="text-ink font-serif text-lg leading-7">写真とことばをしまう場所</p>
            <p className="text-ink-tertiary text-xs leading-6">1まいを選び、短い見出しを添えます</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Link
      href={`/memory/${memory.id}`}
      data-testid="home-first-view-photo-mat"
      className="photo-mat ease-organic block rounded-[var(--radius-sheet)] p-2 transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
    >
      {typeof coverUrl === 'string' ? (
        <Image
          src={coverUrl}
          alt=""
          width={360}
          height={270}
          sizes="(max-width: 480px) 88vw, 360px"
          priority
          className="aspect-[4/3] w-full rounded-[var(--radius-photo-inner)] object-cover"
        />
      ) : (
        <div
          className="bg-paper-slip/70 flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius-photo-inner)]"
          aria-hidden="true"
        >
          <BookOpen className="text-sakura-deep size-9" />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 px-1 pb-1">
        <div className="min-w-0">
          <p className="meta-label">最近のページ</p>
          <p className="text-ink mt-1 line-clamp-2 break-words font-serif text-base leading-6 [overflow-wrap:anywhere]">
            {memory.title}
          </p>
        </div>
        <ChevronRight className="text-ink-tertiary size-5 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  )
}

function HomeGentleStats({ ageLabel, togetherDays }: { ageLabel: string; togetherDays: number }) {
  return (
    <section aria-labelledby="home-gentle-stats">
      <h2 id="home-gentle-stats" className="meta-label mb-3">
        この場所の あゆみ
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        <Stat number={ageLabel.replace('生後 ', '')} label="いまの月齢" />
        <Stat number={String(togetherDays)} label="一緒に過ごした日数" unit="日" />
      </dl>
    </section>
  )
}

function HomeBodySkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-3" aria-hidden="true">
        <div className="bg-warm h-5 w-24 animate-pulse rounded" />
        <div className="bg-warm h-8 w-44 animate-pulse rounded" />
        <div className="bg-warm h-12 w-full animate-pulse rounded-full" />
      </div>
      <div
        className="photo-mat aspect-[4/3] w-full animate-pulse rounded-[var(--radius-sheet)]"
        aria-hidden="true"
      />
      <section>
        <div
          className="bg-warm h-24 w-full animate-pulse rounded-[var(--radius-paper-slip)]"
          aria-hidden="true"
        />
      </section>
    </div>
  )
}

function Stat({ number, label, unit }: { number: string; label: string; unit?: string }) {
  return (
    <div className="paper-surface flex min-h-28 flex-col items-center justify-center rounded-[var(--radius-paper-slip)] px-2 py-4 text-center">
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
