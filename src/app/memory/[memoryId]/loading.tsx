export default function Loading() {
  return (
    <main className="bg-canvas min-h-dvh pb-28">
      <div className="relative mx-auto w-full max-w-md">
        <div
          className="bg-canvas/90 absolute left-4 top-4 z-10 h-10 w-10 rounded-full backdrop-blur-sm"
          aria-hidden="true"
        />
        <div
          className="bg-warm aspect-[4/5] w-full animate-pulse rounded-b-3xl"
          aria-hidden="true"
        />
        <article className="px-6 pt-8" aria-hidden="true">
          <div className="bg-warm h-3 w-32 animate-pulse rounded" />
          <div className="bg-warm mt-4 h-8 w-3/4 animate-pulse rounded" />
          <div className="mt-6 space-y-2">
            <div className="bg-warm h-4 w-full animate-pulse rounded" />
            <div className="bg-warm h-4 w-5/6 animate-pulse rounded" />
            <div className="bg-warm h-4 w-4/6 animate-pulse rounded" />
          </div>
        </article>
      </div>
    </main>
  )
}
