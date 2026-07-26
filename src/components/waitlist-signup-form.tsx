'use client'

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'

type FormStatus =
  | 'idle'
  | 'submitting'
  | 'accepted'
  | 'validationError'
  | 'rateLimited'
  | 'unavailable'

const privacyPolicyVersion = 'prelaunch-2026-07-25'
const waitlistSource = 'current-lp'
const waitlistContactEmail = 'privacy@hana.app'

export function WaitlistSignupForm() {
  const emailRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<FormStatus>('idle')
  const [invalidField, setInvalidField] = useState<'email' | 'consent' | null>(null)

  async function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const email = formData.get('email')
    const consent = formData.get('consent') === 'true'

    setStatus('submitting')
    setInvalidField(null)

    try {
      const response = await fetch('/v1/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          source: waitlistSource,
          privacy_policy_version: privacyPolicyVersion,
        }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          setStatus('rateLimited')
          return
        }
        if (response.status >= 500) {
          setStatus('unavailable')
          return
        }

        setStatus('validationError')
        if (!consent) {
          setInvalidField('consent')
          consentRef.current?.focus()
          return
        }
        setInvalidField('email')
        emailRef.current?.focus()
        return
      }

      form.reset()
      setStatus('accepted')
    } catch {
      setStatus('unavailable')
      setInvalidField(null)
    }
  }

  return (
    <form
      id="waitlist-form"
      className="paper-surface lp-soft-form mt-8 grid gap-4 p-4 sm:p-5"
      action="/v1/waitlist"
      method="post"
      aria-describedby="waitlist-purpose privacy-note waitlist-status"
      onSubmit={submitWaitlist}
    >
      <div>
        <label className="text-ink mb-2 block text-sm font-bold" htmlFor="waitlist-email">
          メールアドレス
        </label>
        <input
          ref={emailRef}
          id="waitlist-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={320}
          placeholder="メールアドレス"
          required
          aria-invalid={invalidField === 'email'}
          className="border-hairline bg-paper-slip text-ink lp-soft-field min-h-[52px] w-full border px-5 text-base"
        />
      </div>

      <label
        className="bg-warm/70 lp-soft-card text-ink-secondary tap-target grid grid-cols-[24px_minmax(0,1fr)] gap-3 p-3 text-sm leading-7"
        htmlFor="waitlist-consent"
      >
        <input
          ref={consentRef}
          id="waitlist-consent"
          name="consent"
          type="checkbox"
          value="true"
          required
          aria-invalid={invalidField === 'consent'}
          className="mt-1 h-5 w-5 accent-[var(--success-leaf)]"
        />
        <span>
          待機リスト登録、β版のご案内、任意のインタビューやフィードバック協力のお願い、正式リリースのお知らせのためにメールを受け取ることに同意します。
        </span>
      </label>

      <input type="hidden" name="source" value={waitlistSource} />
      <input type="hidden" name="privacy_policy_version" value={privacyPolicyVersion} />

      <button
        className="bg-primary text-primary-foreground hover:bg-leaf-deep tap-target ease-organic inline-flex w-full items-center justify-center rounded-full px-6 font-bold shadow-lift transition disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? '送信中...' : '待機リストに登録する'}
      </button>

      <div id="privacy-note" className="bg-warm/70 lp-soft-card grid gap-2 p-3">
        <p className="text-ink-secondary text-sm leading-7">
          取得目的と管理方法はプライバシーポリシーに明記します。メールアドレスは待機リスト管理の目的に限り、アクセス制御された環境で管理します。
          案内停止や登録情報の削除は下記メールアドレスまでご連絡ください。
        </p>
        <a
          className="border-hairline text-leaf-deep tap-target inline-flex w-fit items-center rounded-full border bg-paper-slip px-4 text-sm font-bold"
          href={`mailto:${waitlistContactEmail}`}
        >
          {waitlistContactEmail}
        </a>
        <a
          className="border-hairline text-leaf-deep tap-target inline-flex w-fit items-center rounded-full border bg-paper-slip px-4 text-sm font-bold"
          href="/privacy"
        >
          プライバシーポリシーを確認する
        </a>
      </div>
      <p
        id="waitlist-status"
        className="text-ink-secondary min-h-6 text-sm leading-7"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status === 'submitting' ? '送信しています。' : null}
        {status === 'accepted'
          ? '登録を受け付けました。β版や正式リリースの準備が整い次第、ご連絡します。'
          : null}
        {status === 'validationError' ? '入力内容を確認してください。' : null}
        {status === 'rateLimited'
          ? '送信が続いています。少し時間をおいてからお試しください。'
          : null}
        {status === 'unavailable'
          ? '送信できませんでした。時間をおいてもう一度お試しください。'
          : null}
      </p>
    </form>
  )
}
