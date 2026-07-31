import Link from 'next/link'
import { FocusedShell } from '@/components/product/app-shell'
import { StatePanel } from '@/components/product/surfaces'
import { Button } from '@/components/ui/button'

export default function AccountClosedPage() {
  return (
    <FocusedShell>
      <StatePanel aria-labelledby="account-closed-title" className="text-center">
        <p className="meta-label">Hana</p>
        <h1 id="account-closed-title" className="mt-2 font-serif text-2xl">
          退会を受け付けました
        </h1>
        <p className="text-ink-secondary mt-4 text-sm leading-narrative">
          通常のHana画面と新しい画像URLは使えなくなりました。すでに読み込み済みの写真は最大30分見られる場合があります。
        </p>
        <p className="text-ink-tertiary mt-3 text-xs leading-narrative">
          データの安全な削除処理は、このあと行われます。
        </p>
        <Button asChild className="mt-7 w-full">
          <Link href="/lp">Hanaについて見る</Link>
        </Button>
      </StatePanel>
    </FocusedShell>
  )
}
