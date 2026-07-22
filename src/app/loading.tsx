import { Card, CardHeader } from '@/components/ui/card'

export default function Loading() {
  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center justify-between" aria-hidden="true">
          <div className="bg-warm h-5 w-28 animate-pulse rounded" />
          <div className="bg-warm h-10 w-10 animate-pulse rounded-full" />
        </header>

        <Card className="bg-elevated shadow-soft" aria-hidden="true">
          <CardHeader>
            <div className="bg-warm h-6 w-4/5 animate-pulse rounded" />
            <div className="bg-warm mt-2 h-4 w-2/3 animate-pulse rounded" />
            <div className="bg-warm ml-auto mt-3 h-5 w-5 animate-pulse rounded-full" />
          </CardHeader>
        </Card>

        <section className="mt-10" aria-hidden="true">
          <div className="bg-warm mb-3 h-4 w-24 animate-pulse rounded" />
          <ul className="-mx-6 flex gap-3 overflow-hidden px-6 pb-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="w-[140px] shrink-0">
                <div className="bg-warm aspect-[4/5] w-full animate-pulse rounded-2xl" />
                <div className="bg-warm mt-2 h-4 w-5/6 animate-pulse rounded" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
