import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { HomeGreeting } from '@/components/home-greeting'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { getCurrentUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'

// V0 prompt §5.2 ホーム画面:
//   1. Top bar: 時間帯挨拶 + 子どもアバター
//   2. Hero card → /record
//   3. (1年前の今日: MVP ではスキップ・ISSUE-017 で本格対応)
//   4. 最近のページ (横スクロール)
//   5. これまでの あゆみ stat (全体カウントベースで代替・月別フィルタは ISSUE-016)
//   6. 空状態: 「○○ちゃんとの 1まいめを、ひらきましょう」
//
// ISSUE-026: Server Component 化。 HTML に hero + carousel cover URL を同梱して
// LCP の JS waterfall を解消。 時間帯挨拶のみ <HomeGreeting /> Client Component に切り出し。

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

  // 並列フェッチ: child / memories(limit=5)。 me は getCurrentUser で取得済。
  const [child, memoriesResult] = await Promise.all([
    prisma.child.findFirst({
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    fetchMemoriesWithCovers({ userId: user.id, limit: 5 }),
  ])

  if (!child) redirect('/onboarding')

  const memories = memoriesResult.items
  const childInitial = Array.from(child.name)[0] ?? '?'
  const ageLabel = formatAgeLabel(computeAge(child.birthdate, new Date()))
  const togetherDays = daysBetween(child.createdAt, new Date())

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        {/* Top bar */}
        <header className="mb-8 flex items-center justify-between">
          <HomeGreeting />
          <Link
            href="/settings"
            aria-label={`${child.name} の せってい`}
            className="bg-warm text-sakura-deep ring-elevated flex h-10 w-10 items-center justify-center rounded-full font-serif text-base ring-2"
          >
            {childInitial}
          </Link>
        </header>

        {/* Hero card */}
        <Link
          href="/record"
          className="ease-organic block transition-transform active:scale-[0.97]"
        >
          <Card className="bg-elevated shadow-soft">
            <CardHeader>
              <CardTitle className="font-serif text-xl leading-snug">
                今日の {child.name} ちゃんを、のこしませんか
              </CardTitle>
              <CardDescription className="text-ink-secondary mt-2 text-sm">
                しゃしん 1まいから、30びょうで かんりょうします
              </CardDescription>
              <p className="text-sakura-deep mt-3 text-right text-xl" aria-hidden="true">
                →
              </p>
            </CardHeader>
          </Card>
        </Link>

        {memories.length === 0 ? (
          <section className="mt-10 flex flex-col items-center text-center">
            <span className="text-hairline mb-6 text-7xl" aria-hidden="true">
              ❀
            </span>
            <p className="text-ink-secondary leading-narrative font-serif text-base">
              {child.name} ちゃんとの 1まいめを、
              <br />
              ひらきましょう
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/record">はじめての ページを つくる</Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="mt-10">
              <div className="mb-3 flex items-center justify-between">
                <p className="meta-label">さいきんの ページ</p>
                <Link href="/album" className="text-ink-tertiary text-xs">
                  もっとみる →
                </Link>
              </div>
              <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
                {memories.map((m) => {
                  const url = m.coverThumbnailUrl
                  return (
                    <li key={m.id} className="w-[140px] shrink-0">
                      <Link
                        href={`/memory/${m.id}`}
                        className="ease-organic block transition-transform active:scale-[0.97]"
                      >
                        {typeof url === 'string' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={m.title}
                            className="border-hairline aspect-[4/5] w-full rounded-2xl border object-cover"
                          />
                        ) : (
                          <div className="bg-warm text-sakura-deep border-hairline flex aspect-[4/5] w-full items-center justify-center rounded-2xl border text-3xl">
                            ❀
                          </div>
                        )}
                        <p className="text-ink mt-2 line-clamp-2 font-serif text-sm leading-tight">
                          {m.title}
                        </p>
                      </Link>
                    </li>
                  )
                })}
                <li className="w-[140px] shrink-0">
                  <Link
                    href="/album"
                    className="bg-warm text-ink-secondary border-hairline ease-organic flex aspect-[4/5] w-full items-center justify-center rounded-2xl border font-serif text-sm transition-transform active:scale-[0.97]"
                  >
                    もっとみる →
                  </Link>
                </li>
              </ul>
            </section>

            <section className="mt-10">
              <p className="meta-label mb-3">これまでの あゆみ</p>
              <div className="bg-elevated border-hairline grid grid-cols-3 divide-x divide-[var(--hairline)] rounded-2xl border">
                <Stat number={String(memories.length)} unit="ページ" />
                <Stat number={ageLabel.replace('生後 ', '')} unit={`${child.name} ちゃん`} />
                <Stat number={String(togetherDays)} unit="日 いっしょ" />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Stat({ number, unit }: { number: string; unit: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-5">
      <span className="text-ink tabular-nums-light text-2xl">{number}</span>
      <span className="text-ink-tertiary mt-1 text-center text-[11px]">{unit}</span>
    </div>
  )
}
