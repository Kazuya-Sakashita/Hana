import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MemoryActions } from '@/components/memory-actions'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoryWithPreviews } from '@/features/memories/server/queries'

// ISSUE-027: memory 詳細 SC化 + Suspense streaming
//   - 認証チェックだけ最上位、 即 shell (back link) を返す
//   - 本画像 / 本文 / メタは Suspense 内で async fetch + HTML 同梱
//   - interactive 部分 (favorite / delete dialog) は MemoryActions Client Component
//   - not_found / forbidden は notFound() で 404 統一 (情報漏洩防止)

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ memoryId: string }>
}

export default async function MemoryDetailPage({ params }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const { memoryId } = await params

  return (
    <main className="bg-canvas min-h-dvh pb-28">
      <div className="relative mx-auto w-full max-w-md">
        {/* Back link は即出る (static) */}
        <Link
          href="/album"
          prefetch={true}
          aria-label="アルバムへ もどる"
          className="bg-canvas/90 text-ink absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-lg backdrop-blur-sm"
        >
          ‹
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

  return (
    <>
      {memory.imagesWithPreviews.map((img, idx) =>
        img.previewUrl ? (
          <Image
            key={img.id}
            src={img.previewUrl}
            alt=""
            width={1024}
            height={1280}
            sizes="(max-width: 480px) 100vw, 480px"
            priority={idx === 0}
            className="aspect-[4/5] w-full rounded-b-3xl object-cover"
          />
        ) : (
          <div
            key={img.id}
            className="bg-warm aspect-[4/5] w-full animate-pulse rounded-b-3xl"
            aria-hidden="true"
          />
        ),
      )}

      <article className="px-6 pt-8">
        <p className="meta-label">{metaParts.join(' ・ ')}</p>
        <h1 className="text-ink mt-3 font-serif text-[26px] font-medium leading-tight tracking-tight">
          {memory.title}
        </h1>
        {memory.body ? (
          <p className="text-ink leading-bookish mt-6 font-serif text-[17px]">{memory.body}</p>
        ) : null}

        {child && ageLabel ? (
          <p className="text-ink-secondary border-hairline mx-auto mt-8 max-w-xs border-y px-4 py-4 text-center font-serif text-sm italic">
            {child.name} ちゃん、{ageLabel}
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
      <div className="bg-warm aspect-[4/5] w-full animate-pulse rounded-b-3xl" aria-hidden="true" />
      <article className="px-6 pt-8">
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
