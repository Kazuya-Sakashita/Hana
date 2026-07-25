import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { WaitlistSignupForm } from '@/components/waitlist-signup-form'

export const metadata: Metadata = {
  title: 'Hana | 写真1枚から、30秒で残す育児記録',
  description: 'Hana の公開前待機リスト登録ページ',
}

export default function LandingPage() {
  return (
    <main className="bg-canvas text-ink min-h-dvh" data-public-lp="waitlist">
      <header className="border-hairline/80 bg-canvas/92 sticky top-0 z-20 border-b px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            href="/lp"
            className="tap-target inline-flex items-center rounded-full font-serif text-2xl tracking-[0]"
          >
            Hana
          </Link>
          <nav className="text-ink-secondary flex items-center gap-1 text-sm" aria-label="ページ内">
            <a className="tap-target inline-flex items-center rounded-full px-3" href="#value">
              記録例
            </a>
            <a className="tap-target inline-flex items-center rounded-full px-3" href="#trust">
              安心
            </a>
            <a
              className="tap-target inline-flex items-center rounded-full px-3"
              href="#waitlist-form"
            >
              待機リスト
            </a>
          </nav>
        </div>
      </header>

      <section className="px-5 py-16 sm:py-20" aria-labelledby="lp-title">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.7fr)]">
          <div>
            <p className="meta-label">写真1枚から、30秒で残す育児記録</p>
            <h1 id="lp-title" className="mt-5 font-serif text-5xl leading-[1.08] sm:text-7xl">
              子どもとの今日が、
              <br />
              10年後の宝物になる。
            </h1>
            <p className="text-ink-secondary mt-6 max-w-xl text-base leading-8 sm:text-lg">
              寝かしつけのあと、もう書く気力がない日も。写真を1まい選ぶだけ。 必要なら Hana
              が静かな下書きにして、あとで読み返せるページに残します。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                className="bg-primary text-primary-foreground hover:bg-leaf-deep tap-target inline-flex items-center justify-center rounded-full px-6 font-bold shadow-lift"
                href="#waitlist-form"
              >
                待機リストに登録する
              </a>
              <a
                className="border-hairline bg-paper-slip tap-target inline-flex items-center justify-center rounded-full border px-6 font-bold"
                href="#value"
              >
                記録例を見る
              </a>
            </div>
            <p className="text-ink-tertiary mt-5 text-sm leading-7">
              AI は同意後だけ。使わずに保存でき、保存前にことばを直せます。
            </p>
          </div>

          <figure className="paper-surface rounded-[var(--radius-sheet)] p-3 sm:p-4">
            <div className="photo-mat rounded-[var(--radius-photo-mat)] p-2">
              <Image
                src="/lp/hana-before-after-safe-still-life.svg"
                width={720}
                height={520}
                alt="合成の日常静物ビジュアル"
                priority
                className="w-full rounded-[var(--radius-photo-inner)]"
              />
            </div>
            <figcaption className="border-hairline mt-5 border-t pt-5">
              <p className="meta-label">保存されたページ</p>
              <h2 className="mt-2 font-serif text-2xl">洗濯ものをたたむ前</h2>
              <p className="text-ink-secondary mt-3 leading-8">
                机の上に残った小さなくつした。忙しかった今日も、あとで開ける小さなページにします。
              </p>
              <p className="text-ink-tertiary mt-3 text-xs leading-6">
                実ユーザー写真ではない synthetic preview です。
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="value" className="px-5 py-14" aria-labelledby="value-title">
        <div className="mx-auto max-w-6xl">
          <p className="meta-label">Before / After</p>
          <h2 id="value-title" className="mt-3 max-w-3xl font-serif text-4xl leading-tight">
            写真を、記憶にかえる。
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <section className="border-hairline bg-paper-slip rounded-[var(--radius-paper-slip)] border p-5">
              <p className="meta-label">Before</p>
              <h3 className="mt-2 font-serif text-2xl">写真だけ</h3>
              <p className="text-ink-secondary mt-3 leading-8">
                撮った日は残る。でも、何をしていたか、なぜ残したかったかは少しずつ薄れていく。
              </p>
              <span className="border-hairline text-leaf-deep mt-5 inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold">
                写真のみ
              </span>
            </section>
            <section className="border-hairline bg-paper-slip rounded-[var(--radius-paper-slip)] border p-5">
              <p className="meta-label">After</p>
              <h3 className="mt-2 font-serif text-2xl">写真 + タイトル</h3>
              <p className="text-ink-secondary mt-3 leading-8">
                一覧で見返したとき、その日の場面にすぐ戻れる短い見出しを添える。
              </p>
              <strong className="mt-5 block font-serif text-xl font-normal">
                机の上の小さなくつした
              </strong>
            </section>
            <section className="border-hairline bg-paper-slip rounded-[var(--radius-paper-slip)] border p-5">
              <p className="meta-label">After</p>
              <h3 className="mt-2 font-serif text-2xl">写真 + 短い本文</h3>
              <p className="text-ink-secondary mt-3 leading-8">
                洗濯ものをたたむ前、木のくるまをそっと横に置いた。何でもない朝の支度が、
                あとで開ける小さなページになった。
              </p>
            </section>
          </div>
        </div>
      </section>

      <section id="trust" className="bg-warm px-5 py-14" aria-labelledby="trust-title">
        <div className="mx-auto max-w-6xl">
          <p className="meta-label">Trust before delight</p>
          <h2 id="trust-title" className="mt-3 font-serif text-4xl">
            Hana が、しないこと。
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {(
              [
                [
                  'ストリークでせかしません。',
                  '続かなかった日を責めず、戻ってこられる場所として設計します。',
                ],
                [
                  'SNS のように見せません。',
                  '公開や反応ではなく、家族のための私的なアルバムを優先します。',
                ],
                [
                  'AI 利用を曖昧にしません。',
                  'AI は同意後だけ。使わずに写真とことばを残す道も残します。',
                ],
              ] as const
            ).map(([title, body]) => (
              <li
                key={title}
                className="border-hairline bg-paper-slip rounded-[var(--radius-paper-slip)] border p-5"
              >
                <strong className="font-serif text-xl font-normal">{title}</strong>
                <p className="text-ink-secondary mt-3 leading-8">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-leaf-deep px-5 py-16 text-white" aria-labelledby="waitlist-title">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(320px,0.62fr)]">
          <div>
            <p className="text-paper-slip/75 text-sm font-bold uppercase">Pre-launch waitlist</p>
            <h2 id="waitlist-title" className="mt-4 font-serif text-4xl leading-tight">
              今日の1まいを、はじめの1ページに。
            </h2>
            <p id="waitlist-purpose" className="text-paper-slip/85 mt-5 leading-8">
              公開前の検証フェーズです。待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、
              正式リリースのお知らせに限ってメールアドレスをお預かりします。
            </p>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="ストア導線">
              <span className="border-paper-slip/30 text-paper-slip/80 inline-flex min-h-11 items-center rounded-full border px-4 text-sm">
                App Store 準備中
              </span>
              <span className="border-paper-slip/30 text-paper-slip/80 inline-flex min-h-11 items-center rounded-full border px-4 text-sm">
                Google Play 準備中
              </span>
            </div>
          </div>
          <WaitlistSignupForm />
          <noscript>
            <style>
              {'#waitlist-form{display:none}.no-js-waitlist-note{display:block!important}'}
            </style>
          </noscript>
          <p className="no-js-waitlist-note text-paper-slip/80 hidden text-sm leading-7">
            待機リスト登録には JavaScript が必要です。メールアドレスがURLに残らないよう、
            この環境では送信を受け付けません。
          </p>
        </div>
      </section>
    </main>
  )
}
