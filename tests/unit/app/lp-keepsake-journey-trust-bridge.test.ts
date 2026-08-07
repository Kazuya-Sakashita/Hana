import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const waitlistFormSource = readFileSync(
  new URL('../../../src/components/waitlist-signup-form.tsx', import.meta.url),
  'utf8',
)
const issue085Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-085-lp-keepsake-journey-trust-bridge.md', import.meta.url),
  'utf8',
)
const issue075Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-075-lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)

describe('ISSUE-085 LP keepsake journey and public trust bridge', () => {
  it('moves the value proof from repeated cards into one photo-to-memory journey', () => {
    expect(lpSource).toContain('data-lp-keepsake-journey="photo-to-memory"')
    expect(lpSource).toContain('journeySteps.map')
    expect(lpSource).toContain('photo-mat lp-soft-photo-mat p-2')
    expect(lpSource).toContain('paper-surface lp-soft-card px-5 py-5')
    expect(lpSource).toContain('今日の1枚を起点にする')
    expect(lpSource).toContain('見返した時に戻れる名前を添える')
    expect(lpSource).toContain('あとで開ける小さなページにする')
  })

  it('places email purpose and AI-consent boundaries before the waitlist form', () => {
    expect(lpSource).toContain('data-lp-trust-bridge="waitlist"')
    expect(lpSource).toContain('メールだけお預かりします')
    expect(lpSource).toContain('使い道を限定します')
    expect(lpSource).toContain('AI 同意は記録時に別で確認します')
    expect(lpSource).toContain('待機リスト登録だけで、写真を AI に送る同意にはなりません。')
    expect(lpSource).toContain('href="/privacy"')
  })

  it('raises tired-parent relevance and routes trust details to privacy anchors', () => {
    expect(lpSource).toContain('data-lp-relevance="tired-parent"')
    expect(lpSource).toContain('className="mt-8 flex flex-col gap-3 sm:flex-row"')
    expect(lpSource).toContain('className="mt-5 flex max-w-2xl flex-wrap gap-2"')
    expect(lpSource).toContain('寝かしつけ後でも')
    expect(lpSource).toContain('3行書く気力が残っていない夜に')
    expect(lpSource).toContain('写真から始める')
    expect(lpSource).toContain('保存前に自分のことばへ整えられる')
    expect(lpSource).toContain('data-lp-trust-detail-links="privacy-anchors"')
    expect(lpSource).toContain("href: '/privacy#privacy-collected'")
    expect(lpSource).toContain("href: '/privacy#privacy-purpose'")
    expect(lpSource).toContain("href: '/privacy#privacy-stop-delete'")
  })

  it('keeps the waitlist form as a light paper slip with large controls', () => {
    expect(waitlistFormSource).toContain('paper-surface lp-soft-form')
    expect(waitlistFormSource).toContain('bg-warm/70 lp-soft-card')
    expect(waitlistFormSource).toContain('min-h-[52px]')
    expect(waitlistFormSource).toContain('tap-target')
    expect(waitlistFormSource).not.toContain('bg-paper-slip/[0.08]')
    expect(lpSource).toContain('no-js-waitlist-note bg-paper-slip text-ink-secondary lp-soft-card')
    expect(lpSource).not.toContain('no-js-waitlist-note text-paper-slip/80')
  })

  it('does not weaken the public trust blocker or add unreviewed claims', () => {
    const activeCopy = `${lpSource}\n${waitlistFormSource}`
    expect(issue085Source).toMatch(/status: (in_progress|review|done)/)
    expect(issue085Source).toContain('privacy / legal review の完了扱い')
    expect(issue075Source).toContain('status: done')
    expect(issue075Source).toContain('Privacy / Legal Human Review 済み')
    expect(activeCopy).not.toMatch(
      /zero data retention|ZDR|0-day|vendor retention|AI training|学習に使いません|AI学習に使いません|復元可能|完全削除|法務確認済み|レビュー済み|配信基盤を確定済み|メール配信基盤は確定/i,
    )
  })
})
