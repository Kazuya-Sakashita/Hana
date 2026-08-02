import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MemoryEditForm } from '@/features/memories/client/memory-edit-form'
import { fetchEditableMemory } from '@/features/memories/server/queries'
import { signInPath } from '@/lib/auth/safe-redirect'
import { getCurrentUser } from '@/server/auth/current-user'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '記録を編集 | Hana',
}

interface PageProps {
  params: Promise<{ memoryId: string }>
}

export default async function MemoryEditPage({ params }: PageProps) {
  const [{ memoryId }, user] = await Promise.all([params, getCurrentUser()])
  const detailPath = `/memory/${encodeURIComponent(memoryId)}`

  if (!user) redirect(signInPath(`${detailPath}/edit`))

  const memory = await fetchEditableMemory({ memoryId, userId: user.id })
  if (!memory) notFound()

  return (
    <main className="bg-canvas min-h-dvh px-4 pb-[calc(env(safe-area-inset-bottom)+3rem)] pt-4">
      <div className="mx-auto w-full max-w-md">
        <MemoryEditForm
          key={memory.updatedAt.toISOString()}
          memoryId={memory.id}
          initialUpdatedAt={memory.updatedAt.toISOString()}
          initialTitle={memory.title}
          initialBody={memory.body}
          initialWeather={memory.weather}
        />
      </div>
    </main>
  )
}
