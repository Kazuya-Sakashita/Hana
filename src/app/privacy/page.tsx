import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  Handshake,
  Mail,
  RotateCcw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { QuietIcon } from '@/components/product/icons'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Hana',
  description: 'Hana の公開前検証における待機リスト登録情報の扱い',
}

const waitlistContactEmail = 'privacy@hana.app'

const summaryItems: {
  title: string
  body: string
  icon: LucideIcon
}[] = [
  {
    title: '公開前検証のため',
    body: '待機リスト登録と、β版や正式リリースのご案内につなげるための入口です。',
    icon: ClipboardList,
  },
  {
    title: 'このフォームではメールだけ',
    body: '子どもの名前、写真、生年月日、住所、位置情報はこのフォームでは取得しません。',
    icon: Mail,
  },
  {
    title: '目的を限定',
    body: '登録管理、β版の案内、任意の協力依頼、正式リリースのお知らせに限ります。',
    icon: Bell,
  },
  {
    title: '公開前検証用に確認済み',
    body: '公開前検証用の確認済みコピーです。正式公開前にサービス内容が変わる場合は更新します。',
    icon: ShieldCheck,
  },
]

const policyItems: {
  id: string
  title: string
  body: string
  icon: LucideIcon
}[] = [
  {
    id: 'privacy-collected',
    title: '取得する情報',
    body: '公開前の待機リストフォームでは、メールアドレスを取得します。子どもの名前、写真、生年月日、住所、位置情報はこのフォームでは取得しません。',
    icon: Mail,
  },
  {
    id: 'privacy-purpose',
    title: '利用目的',
    body: '待機リスト登録の管理、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限って利用します。',
    icon: ClipboardList,
  },
  {
    id: 'privacy-management',
    title: '管理方法',
    body: '取得したメールアドレスは、認証とアクセス制御が可能な管理環境で扱います。LP の表示ログ、API レスポンス、開発証跡にはメールアドレスを含めません。',
    icon: ShieldCheck,
  },
  {
    id: 'privacy-sharing',
    title: '第三者提供',
    body: '待機リストの連絡先を広告配信や無関係な案内のために第三者へ提供しません。β版や正式リリースの案内に必要な配信基盤は、現時点ではサービス名を明記せず、正式公開時点で必要に応じて追記します。',
    icon: Handshake,
  },
  {
    id: 'privacy-stop-delete',
    title: '停止・削除',
    body: `案内の停止や登録情報の削除を希望する場合は、${waitlistContactEmail} までご連絡ください。フォームは現時点では設置しません。`,
    icon: RotateCcw,
  },
]

export default function PrivacyPage() {
  return (
    <main
      className="bg-canvas min-h-dvh overflow-x-hidden px-5 pb-16 pt-8 sm:px-6 sm:pt-10"
      data-public-privacy="waitlist"
    >
      <article className="mx-auto max-w-3xl">
        <Link
          href="/lp"
          className="text-ink-secondary hover:text-ink tap-target ease-organic inline-flex items-center gap-2 rounded-full px-3 font-serif text-sm transition-colors"
        >
          <QuietIcon icon={ArrowLeft} tone="muted" size="sm" />
          LPへ戻る
        </Link>

        <header className="mt-8 space-y-4">
          <p className="meta-label">Pre-launch privacy policy</p>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">プライバシーポリシー</h1>
          <p className="text-ink-secondary max-w-2xl leading-8">
            このページは、Hana の公開前検証で待機リスト登録を受け付けるための安全側のドラフトです。
            公開前検証用の文言として確認済みで、正式公開前にサービス内容や運用方法が変わる場合は更新します。
          </p>
        </header>

        <section
          className="photo-mat mt-8 rounded-[var(--radius-sheet)] p-2"
          aria-labelledby="privacy-summary-title"
          data-public-privacy-summary="waitlist"
        >
          <div className="bg-paper-slip rounded-[var(--radius-paper-slip)] px-5 py-6 sm:px-7">
            <p className="meta-label">待機リスト登録の前に</p>
            <h2 id="privacy-summary-title" className="mt-2 font-serif text-2xl leading-snug">
              まず、この4つだけ確認できます。
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {summaryItems.map((item) => (
                <li key={item.title} className="flex min-w-0 gap-3">
                  <span
                    className="border-hairline bg-warm flex size-11 shrink-0 items-center justify-center rounded-full border"
                    aria-hidden="true"
                  >
                    <QuietIcon icon={item.icon} tone="muted" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block font-serif text-base font-normal">{item.title}</strong>
                    <span className="text-ink-secondary mt-1 block text-sm leading-7">
                      {item.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="mt-9 grid gap-4"
          aria-label="待機リスト登録情報の扱い"
          data-public-privacy-details="waitlist"
        >
          {policyItems.map((item, index) => (
            <section
              id={item.id}
              key={item.title}
              className="paper-surface rounded-[var(--radius-paper-slip)] scroll-mt-24 px-5 py-5 sm:px-6"
            >
              <div className="flex min-w-0 gap-4">
                <span
                  className="border-hairline bg-warm flex size-11 shrink-0 items-center justify-center rounded-full border"
                  aria-hidden="true"
                >
                  <QuietIcon icon={item.icon} tone="muted" />
                </span>
                <div className="min-w-0">
                  <p className="meta-label">{String(index + 1).padStart(2, '0')}</p>
                  <h2 className="mt-1 break-words font-serif text-xl leading-snug">{item.title}</h2>
                  <p className="text-ink-secondary mt-3 break-words leading-8">{item.body}</p>
                </div>
              </div>
            </section>
          ))}
        </section>

        <footer
          className="paper-surface text-ink-tertiary mt-6 rounded-[var(--radius-paper-slip)] px-5 py-4 text-sm leading-7"
          data-public-privacy-footer="waitlist"
        >
          <p>
            案内停止・登録情報削除のお問い合わせ:{' '}
            <a
              className="border-hairline text-leaf-deep tap-target mt-2 inline-flex w-fit items-center rounded-full border bg-paper-slip px-4 font-bold"
              href={`mailto:${waitlistContactEmail}`}
            >
              {waitlistContactEmail}
            </a>
          </p>
          <p>制定日: 2026年7月25日</p>
          <p>版: prelaunch-2026-07-25</p>
        </footer>
      </article>
    </main>
  )
}
