import { Card, CardContent } from '@/components/ui/card'

export default function Loading() {
  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center justify-between" aria-hidden="true">
          <div className="bg-warm h-7 w-24 animate-pulse rounded" />
          <div className="bg-warm h-9 w-16 animate-pulse rounded-xl" />
        </header>

        <ul className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Card>
                <CardContent className="flex gap-4 p-4">
                  <div className="bg-warm aspect-[4/5] w-20 shrink-0 animate-pulse rounded-2xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="bg-warm h-3 w-32 animate-pulse rounded" />
                    <div className="bg-warm h-4 w-48 animate-pulse rounded" />
                    <div className="bg-warm h-3 w-full animate-pulse rounded" />
                    <div className="bg-warm h-3 w-5/6 animate-pulse rounded" />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
