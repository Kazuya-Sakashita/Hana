import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Hana',
  description: 'Hana の公開前検証における待機リスト登録情報の扱い',
}

const policyItems = [
  {
    title: '取得する情報',
    body: '公開前の待機リストフォームでは、メールアドレスを取得します。子どもの名前、写真、生年月日、住所、位置情報はこのフォームでは取得しません。',
  },
  {
    title: '利用目的',
    body: '待機リスト登録の管理、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせに限って利用します。',
  },
  {
    title: '管理方法',
    body: '取得したメールアドレスは、認証とアクセス制御が可能な管理環境で扱います。LP の表示ログ、API レスポンス、開発証跡にはメールアドレスを含めません。',
  },
  {
    title: '第三者提供',
    body: '待機リストの連絡先を広告配信や無関係な案内のために第三者へ提供しません。β版や正式リリースの案内に必要な配信基盤を使う場合は、公開前にこのページで扱いを明記します。',
  },
  {
    title: '停止・削除',
    body: '案内の停止や登録情報の削除を希望できる導線を、公開前の運用開始までに明記します。',
  },
]

export default function PrivacyPage() {
  return (
    <main className="bg-canvas min-h-dvh px-6 pb-16 pt-10">
      <article className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-ink-secondary hover:text-ink inline-flex min-h-11 items-center text-sm"
        >
          Hana へ戻る
        </Link>

        <header className="mt-8 space-y-4">
          <p className="meta-label">Pre-launch privacy policy</p>
          <h1 className="font-serif text-3xl leading-tight">プライバシーポリシー</h1>
          <p className="text-ink-secondary leading-8">
            このページは、Hana の公開前検証で待機リスト登録を受け付けるための安全側のドラフトです。
            正式公開前に、法務・プライバシーレビューを通して更新します。
          </p>
        </header>

        <section className="mt-10 space-y-5" aria-label="待機リスト登録情報の扱い">
          {policyItems.map((item) => (
            <section key={item.title} className="border-hairline border-t py-5">
              <h2 className="font-serif text-xl">{item.title}</h2>
              <p className="text-ink-secondary mt-3 leading-8">{item.body}</p>
            </section>
          ))}
        </section>

        <footer className="border-hairline text-ink-tertiary mt-8 border-t pt-5 text-sm leading-7">
          <p>制定日: 2026年7月25日</p>
          <p>版: prelaunch-2026-07-25</p>
        </footer>
      </article>
    </main>
  )
}
