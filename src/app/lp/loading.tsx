import Link from 'next/link'

export default function LandingLoading() {
  return (
    <main
      className="bg-canvas text-ink min-h-dvh px-5 py-12"
      data-public-lp="waitlist"
      data-public-lp-fallback="no-js-shell"
    >
      <section className="paper-surface lp-soft-frame mx-auto max-w-2xl p-5">
        <div className="photo-mat lp-soft-photo-mat p-2">
          <div className="bg-paper-slip lp-soft-photo-inner px-6 py-8">
            <p className="meta-label">Pre-launch waitlist</p>
            <h1 className="mt-4 font-serif text-4xl leading-tight">Hana</h1>
            <p className="text-ink-secondary mt-5 leading-8">
              待機リスト登録には JavaScript が必要です。メールアドレスがURLに残らないよう、
              この環境では送信を受け付けません。
            </p>
            <Link
              href="/privacy"
              className="border-hairline text-leaf-deep tap-target mt-6 inline-flex items-center rounded-full border bg-paper-slip px-4 text-sm font-bold"
            >
              プライバシーポリシーを確認する
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
