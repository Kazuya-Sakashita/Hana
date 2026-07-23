'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AppShell, PageHeader } from '@/components/product/app-shell'
import { DataRow, StatePanel, TrustSection } from '@/components/product/surfaces'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'
import { useChildrenQuery } from '@/features/children/client/use-children'
import { useCurrentUserQuery } from '@/features/me/client/use-current-user'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const meQuery = useCurrentUserQuery()
  const childrenQuery = useChildrenQuery()
  const authError = meQuery.error ?? childrenQuery.error
  const isUnauthorized = isApiProblemError(authError) && authError.reason === 'unauthorized'

  useEffect(() => {
    if (isUnauthorized) {
      router.push('/sign-in')
    }
  }, [isUnauthorized, router])

  async function onSignOut() {
    setSigningOut(true)
    try {
      await fetch('/sign-out', { method: 'POST' })
    } catch {
      // ignore: even on failure, push to /sign-in
    }
    queryClient.clear()
    imageUrlCache.clearAll()
    router.push('/sign-in')
  }

  if (isUnauthorized || meQuery.isPending || childrenQuery.isPending) {
    return (
      <AppShell>
        <p role="status" className="text-ink-tertiary text-center text-sm">
          {quietStateCopy.common.loading}
        </p>
      </AppShell>
    )
  }

  if (meQuery.isError || childrenQuery.isError) {
    return (
      <AppShell>
        <StatePanel>
          <h1 className="font-serif text-xl">{quietStateCopy.common.openFailedTitle}</h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            {quietStateCopy.common.openFailedDescription}
          </p>
          <Button onClick={() => location.reload()} className="mt-6 w-full">
            {quietStateCopy.common.retryOpen}
          </Button>
        </StatePanel>
      </AppShell>
    )
  }

  const me = meQuery.data
  const child = childrenQuery.data.data[0] ?? null
  const ageLabel = child
    ? formatAgeLabel(computeAge(new Date(`${child.birthdate}T00:00:00Z`), new Date()))
    : null

  return (
    <AppShell>
      <PageHeader
        eyebrow="Hana"
        title="せってい"
        description="写真と AI をどう使うか、いま Hana でできることをここにまとめます。"
      />

      <section className="flex flex-col gap-5" aria-label="Hana の設定">
        <TrustSection
          eyebrow="今できること"
          title={child ? `${child.name} ちゃんの記録を残せます` : '記録をはじめられます'}
          description="Hana は、写真からページを作り、アルバムにしまうための場所です。"
        >
          {child ? (
            <>
              <DataRow label="お子さん" value={child.name} />
              {ageLabel ? <DataRow label="いまの月齢" value={ageLabel} /> : null}
            </>
          ) : (
            <DataRow label="お子さん" value="まだ登録されていません。" />
          )}
          {me ? (
            <DataRow
              label="サインイン"
              value={`${me.email ?? 'メール未設定'} の Google アカウントで利用しています。`}
            />
          ) : null}
        </TrustSection>

        {me ? (
          <TrustSection
            eyebrow="AI と写真"
            title={me.ai_consent_at ? 'AI の下書きを使えます' : 'AI は同意後だけ使います'}
            description="AI を使わずに、写真とことばだけでページを残すこともできます。"
          >
            <DataRow
              label="おくるもの"
              value="しゃしん / 登録した呼び名 / 月齢 / ひにち / てんき / ひとこと"
            />
            <DataRow
              label="おくらないもの"
              value="たんじょうび / メール / じゅうしょ / 位置情報 / 画像URL / presigned URL / 保存先のキー"
            />
            <DataRow
              label="データの扱い"
              value="Anthropic Claude API の入出力は通常30日以内に削除されますが、安全確認など一部例外があります。"
            />
          </TrustSection>
        ) : null}

        <TrustSection
          eyebrow="データと削除"
          title="約束できる範囲だけを表示します"
          description="記録を削除すると、アルバムには表示されなくなります。復元機能は今は提供していません。"
        >
          <DataRow
            label="記録の削除"
            value="削除前に確認画面を出します。完全削除や復元可能期間は、この画面では約束しません。"
          />
          <DataRow
            label="証跡"
            value="サポートやレビュー用の証跡に、実写真・実名・メール・生年月日・画像URL・presigned URL・保存先のキー・prompt・AI生成本文は残しません。"
          />
        </TrustSection>

        <TrustSection
          eyebrow="準備中"
          title="まだこの画面では操作できません"
          description="プロフィール編集、export、退会、家族共有、Hana Plus は、実装 Issue と確認手順を分けてから表示します。"
        >
          <DataRow label="プロフィール編集" value="今は操作できません。" />
          <DataRow label="export / 退会" value="今は操作できません。" />
          <DataRow label="家族共有 / Hana Plus" value="今は操作できません。" />
        </TrustSection>

        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onSignOut}
            disabled={signingOut}
            className="text-ink-secondary w-full"
          >
            {signingOut ? 'サインアウト しています…' : 'サインアウト'}
          </Button>
        </div>
      </section>
    </AppShell>
  )
}
