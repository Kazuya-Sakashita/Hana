import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { MemoryActions } from '@/components/memory-actions'
import { QuietIcon } from '@/components/product/icons'
import { PaperSlip } from '@/components/product/surfaces'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoryWithPreviews } from '@/features/memories/server/queries'
import { ProductEventMarker } from '@/features/metrics/client/product-event-marker'
import { signInPath } from '@/lib/auth/safe-redirect'
import { quietStateCopy, recordSavedLandingTitle } from '@/lib/ui/quiet-state-copy'

// ISSUE-057: Memory detail keepsake refresh.
// Keep auth and ownership boundaries intact while making photo and story primary.

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ memoryId: string }>
  searchParams: Promise<{ saved?: string | string[] }>
}

export default async function MemoryDetailPage({ params, searchParams }: PageProps) {
  const [{ memoryId }, query, user] = await Promise.all([params, searchParams, getCurrentUser()])
  if (!user) {
    const savedQuery = query.saved === '1' ? '?saved=1' : ''
    redirect(signInPath(`/memory/${encodeURIComponent(memoryId)}${savedQuery}`))
  }
  const showSavedMoment = query.saved === '1'

  return (
    <main className="bg-canvas min-h-dvh px-4 pb-28 pt-4">
      <div className="relative mx-auto w-full max-w-md">
        {showSavedMoment ? (
          <SavedMemoryNotice />
        ) : (
          <Link
            href="/album"
            prefetch={true}
            aria-label="アルバムへ もどる"
            className="bg-canvas/90 text-ink tap-target absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        )}

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
      <ProductEventMarker eventName="memory_viewed" />
      <section className="photo-mat space-y-3 overflow-hidden rounded-[var(--radius-sheet)] p-2">
        {heroImage?.previewUrl ? (
          <Image
            src={heroImage.previewUrl}
            alt="記録のしゃしん"
            width={1024}
            height={1280}
            sizes="(max-width: 480px) 100vw, 480px"
            priority
            className="aspect-[4/5] w-full rounded-[var(--radius-paper-slip)] object-cover"
          />
        ) : (
          <div
            className="bg-warm aspect-[4/5] w-full animate-pulse rounded-[var(--radius-paper-slip)]"
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
                    <div className="photo-mat rounded-[var(--radius-photo-mat)] p-1">
                      <Image
                        src={img.previewUrl}
                        alt="記録のしゃしん"
                        width={96}
                        height={120}
                        sizes="96px"
                        className="aspect-[4/5] w-full rounded-[var(--radius-photo-inner)] object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="photo-mat aspect-[4/5] w-full rounded-[var(--radius-photo-mat)]"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {child && ageLabel ? (
          <p className="photo-mat text-ink-secondary mx-auto mt-8 max-w-xs rounded-[var(--radius-photo-mat)] px-4 py-4 text-center font-serif text-sm">
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

function SavedMemoryNotice() {
  return (
    <section aria-labelledby="memory-saved-moment-title" className="mb-4 px-1 pt-1">
      <Link
        href="/album"
        prefetch={true}
        className="tap-target text-ink-secondary -ml-2 mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 font-serif text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        アルバムへ
      </Link>
      <PaperSlip
        data-testid="memory-saved-notice"
        role="status"
        aria-live="polite"
        className="text-ink-secondary flex items-start gap-3 px-4 py-3 text-left"
      >
        <QuietIcon icon={CheckCircle2} tone="primary" className="mt-0.5 shrink-0" />
        <div>
          <p className="meta-label">{quietStateCopy.record.savedLandingEyebrow}</p>
          <h2 id="memory-saved-moment-title" className="text-ink mt-1 font-serif text-lg">
            {recordSavedLandingTitle('')}
          </h2>
          <p className="text-ink-secondary leading-narrative mt-2 text-sm">
            {quietStateCopy.record.savedLandingDescription}
          </p>
        </div>
      </PaperSlip>
    </section>
  )
}

function MemoryDetailSkeleton() {
  return (
    <>
      <div
        className="photo-mat aspect-[4/5] w-full animate-pulse rounded-[var(--radius-sheet)]"
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
