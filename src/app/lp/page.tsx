import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ClipboardList,
  FileText,
  ImagePlus,
  Mail,
  PenLine,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { QuietIcon } from '@/components/product/icons'
import { WaitlistSignupForm } from '@/components/waitlist-signup-form'

export const metadata: Metadata = {
  title: 'Hana | 写真1枚から、30秒で残す育児記録',
  description: 'Hana の公開前待機リスト登録ページ',
}

const journeySteps = [
  {
    eyebrow: '写真のみ',
    title: '撮った日の空気を置いておく',
    body: '小さなくつした、木のくるま、朝の支度。まずは写真だけでも、その日の入口になります。',
    icon: ImagePlus,
  },
  {
    eyebrow: '写真 + タイトル',
    title: '見返した時に戻れる名前を添える',
    body: '「机の上の小さなくつした」のように、一覧で見つけやすい短い見出しを残します。',
    icon: PenLine,
  },
  {
    eyebrow: '写真 + 短い本文',
    title: 'あとで開ける小さなページにする',
    body: '洗濯ものをたたむ前、木のくるまをそっと横に置いた。何でもない朝の支度が、あとで開ける小さなページになります。',
    icon: FileText,
  },
] as const

const trustBridgeItems = [
  {
    title: 'メールだけお預かりします',
    body: 'この待機リストでは、子どもの名前、写真、生年月日、住所、位置情報は取得しません。',
    icon: Mail,
  },
  {
    title: '使い道を限定します',
    body: '待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限って使います。',
    icon: ClipboardList,
  },
  {
    title: 'AI 同意は記録時に別で確認します',
    body: '待機リスト登録だけで、写真を AI に送る同意にはなりません。',
    icon: ShieldCheck,
  },
] as const

const relevanceCues = [
  {
    title: '寝かしつけ後でも',
    body: '3行書く気力が残っていない夜に',
    icon: PenLine,
  },
  {
    title: '写真だけの日も',
    body: 'まず1枚を置いておける',
    icon: ImagePlus,
  },
  {
    title: 'あとで直せる',
    body: '保存前に自分のことばへ整えられる',
    icon: FileText,
  },
] as const

const trustDetailLinks = [
  {
    href: '/privacy#privacy-collected',
    title: '取得する情報',
    body: '待機リストではメールだけ',
    icon: Mail,
  },
  {
    href: '/privacy#privacy-purpose',
    title: '利用目的',
    body: '案内と任意の協力依頼に限定',
    icon: ClipboardList,
  },
  {
    href: '/privacy#privacy-stop-delete',
    title: '停止・削除',
    body: '問い合わせ先で受け付け',
    icon: RotateCcw,
  },
] as const

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
              寝かしつけのあと、もう書く気力がない日も。写真を1枚選ぶだけ。必要なら Hana
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
            <ul
              className="mt-5 flex max-w-2xl flex-wrap gap-2"
              data-lp-relevance="tired-parent"
              aria-label="忙しい日の記録の入口"
            >
              {relevanceCues.map((cue) => (
                <li
                  key={cue.title}
                  className="border-hairline bg-paper-slip/78 flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm"
                >
                  <QuietIcon icon={cue.icon} tone="muted" size="sm" />
                  <span className="font-serif">{cue.title}</span>
                  <span className="text-ink-secondary hidden sm:inline">{cue.body}</span>
                </li>
              ))}
            </ul>
          </div>

          <figure className="paper-surface lp-soft-frame p-3 sm:p-4">
            <div className="photo-mat lp-soft-photo-mat p-2">
              <Image
                src="/lp/hana-public-keepsake-still-life.webp"
                width={1440}
                height={1080}
                alt="合成の keepsake 静物ビジュアル"
                priority
                className="lp-soft-photo-inner w-full"
              />
            </div>
            <figcaption className="bg-paper-slip/80 lp-soft-card mt-5 p-5">
              <p className="meta-label">保存されたページ</p>
              <h2 className="mt-2 font-serif text-2xl">洗濯ものをたたむ前</h2>
              <p className="text-ink-secondary mt-3 leading-8">
                机の上に残った小さなくつした。忙しかった今日も、あとで開ける小さなページにします。
              </p>
              <p className="text-ink-tertiary mt-3 text-xs leading-6">
                公開前検証用の合成イメージです。実ユーザー写真ではありません。
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="value"
        className="px-5 py-14"
        aria-labelledby="value-title"
        data-lp-keepsake-journey="photo-to-memory"
      >
        <div className="mx-auto max-w-6xl">
          <p className="meta-label">記録の変化</p>
          <h2 id="value-title" className="mt-3 max-w-3xl font-serif text-4xl leading-tight">
            写真を、記憶にかえる。
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)]">
            <div className="photo-mat lp-soft-photo-mat p-2">
              <div className="bg-paper-slip lp-soft-photo-inner flex min-h-72 flex-col justify-between p-6">
                <div>
                  <p className="meta-label">今日の1枚</p>
                  <p className="mt-4 font-serif text-3xl leading-tight">机の上の小さなくつした</p>
                </div>
                <p className="text-ink-secondary leading-8">
                  撮っただけの写真に、短い見出しと本文を添える。Hana
                  はその変化を、静かな紙片として残します。
                </p>
              </div>
            </div>
            <ol className="paper-surface lp-soft-card px-5 py-5">
              {journeySteps.map((step, index) => (
                <li
                  key={step.eyebrow}
                  className="border-hairline flex gap-4 border-t py-5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span
                    className="border-hairline bg-warm flex size-11 shrink-0 items-center justify-center rounded-full border"
                    aria-hidden="true"
                  >
                    <QuietIcon icon={step.icon} tone={index === 0 ? 'muted' : 'primary'} />
                  </span>
                  <div className="min-w-0">
                    <p className="meta-label">{step.eyebrow}</p>
                    <h3 className="mt-1 break-words font-serif text-xl leading-snug">
                      {step.title}
                    </h3>
                    <p className="text-ink-secondary mt-3 break-words leading-8">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        id="trust"
        className="bg-warm px-5 py-14"
        aria-labelledby="trust-title"
        data-lp-trust-bridge="waitlist"
      >
        <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
          <div>
            <p className="meta-label">待機リストの前に</p>
            <h2 id="trust-title" className="mt-3 font-serif text-4xl leading-tight">
              待機リストの前に、
              <br />
              預けるものを小さくする。
            </h2>
            <p className="text-ink-secondary mt-5 leading-8">
              公開前の検証では、まず連絡先だけをお預かりします。AI
              の利用や写真の扱いは、アプリ内で別に確認します。
            </p>
          </div>
          <div className="paper-surface lp-soft-card px-5 py-5">
            <ul>
              {trustBridgeItems.map((item) => (
                <li
                  key={item.title}
                  className="border-hairline flex gap-4 border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span
                    className="border-hairline bg-warm flex size-11 shrink-0 items-center justify-center rounded-full border"
                    aria-hidden="true"
                  >
                    <QuietIcon icon={item.icon} tone="muted" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block font-serif text-lg font-normal">{item.title}</strong>
                    <span className="text-ink-secondary mt-2 block leading-8">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/privacy"
              className="border-hairline text-leaf-deep tap-target mt-5 inline-flex items-center rounded-full border bg-paper-slip px-4 text-sm font-bold"
            >
              プライバシーポリシーを確認する
            </Link>
            <nav
              className="border-hairline mt-5 grid gap-3 border-t pt-5 sm:grid-cols-3"
              aria-label="プライバシー詳細"
              data-lp-trust-detail-links="privacy-anchors"
            >
              {trustDetailLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border-hairline bg-paper-slip tap-target rounded-[var(--radius-paper-slip)] border px-3 py-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <QuietIcon icon={item.icon} tone="muted" size="sm" />
                    <strong className="font-serif font-normal">{item.title}</strong>
                  </span>
                  <span className="text-ink-secondary mt-2 block leading-6">{item.body}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <section className="bg-warm px-5 py-16" aria-labelledby="waitlist-title">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(320px,0.62fr)]">
          <div className="photo-mat lp-soft-photo-mat p-2">
            <div className="bg-paper-slip lp-soft-photo-inner px-6 py-7">
              <p className="meta-label">公開前の待機リスト</p>
              <h2 id="waitlist-title" className="mt-4 font-serif text-4xl leading-tight">
                今日の1枚を、
                <br />
                はじめの1ページに。
              </h2>
              <p id="waitlist-purpose" className="text-ink-secondary mt-5 leading-8">
                公開前の検証フェーズです。待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、
                正式リリースのお知らせに限ってメールアドレスをお預かりします。
              </p>
              <div className="mt-5 flex flex-wrap gap-2" aria-label="ストア導線">
                <span className="border-hairline text-ink-secondary inline-flex min-h-11 items-center rounded-full border bg-paper-slip px-4 text-sm">
                  App Store 準備中
                </span>
                <span className="border-hairline text-ink-secondary inline-flex min-h-11 items-center rounded-full border bg-paper-slip px-4 text-sm">
                  Google Play 準備中
                </span>
              </div>
            </div>
          </div>
          <WaitlistSignupForm />
          <noscript>
            <style>
              {'#waitlist-form{display:none}.no-js-waitlist-note{display:block!important}'}
            </style>
          </noscript>
          <p className="no-js-waitlist-note bg-paper-slip text-ink-secondary lp-soft-card mt-4 hidden p-3 text-sm leading-7">
            待機リスト登録には JavaScript が必要です。メールアドレスがURLに残らないよう、
            この環境では送信を受け付けません。
          </p>
        </div>
      </section>
    </main>
  )
}
