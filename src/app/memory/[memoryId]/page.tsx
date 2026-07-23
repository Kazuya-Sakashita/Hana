import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { MemoryActions } from '@/components/memory-actions'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoryWithPreviews } from '@/features/memories/server/queries'

// ISSUE-057: Memory detail keepsake refresh.
// Keep auth and ownership boundaries intact while making photo and story primary.

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ memoryId: string }>
}

export default async function MemoryDetailPage({ params }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const { memoryId } = await params

  return (
    <main className="bg-canvas min-h-dvh px-4 pb-28 pt-4">
      <div className="relative mx-auto w-full max-w-md">
        <Link
          href="/album"
          prefetch={true}
          aria-label="アルバムへ もどる"
          className="bg-canvas/90 text-ink tap-target absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>

        <Suspense fallback={<MemoryDetailSkeleton />}>
          <MemoryDetailContent memoryId={memoryId} userId={user.id} />
        </Suspense>
      </div>
    </main>
  )
}

async function MemoryDetailContent({ memoryId, userId }: { memoryId: string; userId: string }) {
  const memory = await fetchMemoryWithPreviews({ memoryId, userId })
  if (!memory) notFound()

  // 該当 child を取得 (memory.childId と紐付け済)。 認可は memory レベルで完了済。
  const child = await prisma.child.findFirst({
    where: { id: memory.childId, userId, deletedAt: null },
    select: { name: true, birthdate: true },
  })

  const recordedDate = new Date(`${memory.recordedAt.toISOString().slice(0, 10)}T00:00:00Z`)
  const ageLabel = child ? formatAgeLabel(computeAge(child.birthdate, recordedDate)) : null
  const dateLabel = memory.recordedAt.toISOString().slice(0, 10).replaceAll('-', '.')
  const metaParts = [dateLabel]
  if (ageLabel) metaParts.push(ageLabel)
  if (memory.weather) metaParts.push(memory.weather)
  const [heroImage, ...additionalImages] = memory.imagesWithPreviews

  return (
    <>
      <section className="photo-mat space-y-3 overflow-hidden rounded-[28px] p-2">
        {heroImage?.previewUrl ? (
          <Image
            src={heroImage.previewUrl}
            alt="記録のしゃしん"
            width={1024}
            height={1280}
            sizes="(max-width: 480px) 100vw, 480px"
            priority
            className="aspect-[4/5] w-full rounded-[22px] object-cover"
          />
        ) : (
          <div
            className="bg-warm aspect-[4/5] w-full animate-pulse rounded-[22px]"
            aria-hidden="true"
          />
        )}
      </section>

      <article className="px-2 pt-8">
        <p className="meta-label">{metaParts.join(' ・ ')}</p>
        <h1 className="text-ink mt-3 break-words font-serif text-[26px] font-medium leading-tight [overflow-wrap:anywhere]">
          {memory.title}
        </h1>
        {memory.body ? (
          <p className="text-ink leading-bookish mt-6 break-words font-serif text-[17px] [overflow-wrap:anywhere]">
            {memory.body}
          </p>
        ) : null}

        {additionalImages.length > 0 ? (
          <section aria-labelledby="memory-additional-photos" className="mt-8">
            <h2 id="memory-additional-photos" className="meta-label mb-3">
              ほかの しゃしん
            </h2>
            <ul className="-mx-2 flex gap-3 overflow-x-auto px-2 py-2">
              {additionalImages.map((img) => (
                <li key={img.id} className="w-24 shrink-0">
                  {img.previewUrl ? (
                    <div className="photo-mat rounded-[16px] p-1">
                      <Image
                        src={img.previewUrl}
                        alt="記録のしゃしん"
                        width={96}
                        height={120}
                        sizes="96px"
                        className="aspect-[4/5] w-full rounded-[12px] object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="photo-mat aspect-[4/5] w-full rounded-[16px]"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {child && ageLabel ? (
          <p className="photo-mat text-ink-secondary mx-auto mt-8 max-w-xs rounded-2xl px-4 py-4 text-center font-serif text-sm">
            {child.name} ちゃんの、{ageLabel} のころ
          </p>
        ) : null}

        <MemoryActions
          memoryId={memory.id}
          childName={child?.name ?? ''}
          initialIsFavorite={memory.isFavorite}
        />
      </article>
    </>
  )
}

function MemoryDetailSkeleton() {
  return (
    <>
      <div
        className="photo-mat aspect-[4/5] w-full animate-pulse rounded-[28px]"
        aria-hidden="true"
      />
      <article className="px-2 pt-8">
        <div className="bg-warm h-3 w-32 animate-pulse rounded" aria-hidden="true" />
        <div className="bg-warm mt-4 h-8 w-3/4 animate-pulse rounded" aria-hidden="true" />
        <div className="mt-6 space-y-2" aria-hidden="true">
          <div className="bg-warm h-4 w-full animate-pulse rounded" />
          <div className="bg-warm h-4 w-5/6 animate-pulse rounded" />
          <div className="bg-warm h-4 w-4/6 animate-pulse rounded" />
        </div>
      </article>
    </>
  )
}
