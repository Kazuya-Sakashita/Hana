import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
        <header className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={detailPath} replace aria-label="記録へ もどる">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <p className="meta-label">ページを整える</p>
            <h1 className="text-ink mt-1 font-serif text-2xl">ことばと天気を なおす</h1>
          </div>
        </header>

        <p className="text-ink-secondary leading-narrative mt-5 px-1 text-sm">
          写真と日付はそのままに、あとから読み返したいことばへ整えられます。
        </p>

        <MemoryEditForm
          memoryId={memory.id}
          initialTitle={memory.title}
          initialBody={memory.body}
          initialWeather={memory.weather}
        />
      </div>
    </main>
  )
}
