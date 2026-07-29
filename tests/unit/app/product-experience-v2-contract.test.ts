import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appShellSource = readFileSync(
  new URL('../../../src/components/product/app-shell.tsx', import.meta.url),
  'utf8',
)
const surfacesSource = readFileSync(
  new URL('../../../src/components/product/surfaces.tsx', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const settingsTrustCenterCopySource = readFileSync(
  new URL('../../../src/lib/ui/settings-trust-center-copy.ts', import.meta.url),
  'utf8',
)
const onboardingSource = readFileSync(
  new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
  'utf8',
)
const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)
const planSource = readFileSync(
  new URL('../../../docs/design/product-experience-v2-plan.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-060-product-experience-v2.md', import.meta.url),
  'utf8',
)

describe('Product Experience V2 contract', () => {
  it('adds shallow product shell and surface modules for Hana screens', () => {
    expect(appShellSource).toContain('export function AppShell')
    expect(appShellSource).toContain('export function FocusedShell')
    expect(appShellSource).toContain('export function PageHeader')
    expect(appShellSource).toContain('bg-canvas min-h-dvh')
    expect(appShellSource).toContain('max-w-md')
    expect(surfacesSource).toContain('export function KeepsakeSurface')
    expect(surfacesSource).toContain('export function StatePanel')
    expect(surfacesSource).toContain('export function TrustSection')
    expect(surfacesSource).toContain('export function DataRow')
    expect(surfacesSource).toContain('paper-surface')
  })

  it('uses the product shell on settings and onboarding without broad API scope', () => {
    expect(settingsSource).toContain("from '@/components/product/app-shell'")
    expect(settingsSource).toContain("from '@/components/product/surfaces'")
    expect(settingsSource).toContain('<AppShell>')
    expect(settingsSource).toContain('<PageHeader')
    expect(settingsSource).toContain('<TrustSection')
    expect(onboardingSource).toContain("from '@/components/product/app-shell'")
    expect(onboardingSource).toContain("from '@/components/product/surfaces'")
    expect(onboardingSource).toContain('<FocusedShell>')
    expect(onboardingSource).toContain('<StatePanel')
    expect(issueSource).toMatch(/\|\s*OpenAPI\s*\|\s*なし\s*\|/)
  })

  it('separates current capability from future work in active UI copy', () => {
    const activeUi = `${settingsSource}\n${onboardingSource}\n${homeSource}\n${memoryActionsSource}`

    expect(settingsTrustCenterCopySource).toContain('概要')
    expect(settingsTrustCenterCopySource).toContain('削除と証跡は、約束できる範囲だけ')
    expect(settingsTrustCenterCopySource).toContain('まだこの画面では操作できません')
    expect(settingsTrustCenterCopySource).toContain('今は操作できません。')
    expect(onboardingSource).toContain('はじめてのページをつくる')
    expect(onboardingSource).toContain('href="/record"')
    expect(onboardingSource).not.toContain('setTimeout')
    expect(homeSource).toContain('保存前に、ことばを整えられます。')
    expect(memoryActionsSource).toContain('ことばと天気を整えたり、しるしと削除を操作できます')
    expect(memoryActionsSource).toContain('href={`/memory/${encodeURIComponent(memoryId)}/edit`}')

    expect(activeUi).not.toContain('あとで、ことばをなおせます')
    expect(activeUi).not.toContain('あとから いつでも かえられます')
    expect(activeUi).not.toContain('プロフィールは あとから せってい')
    expect(activeUi).not.toContain('ちかぢか')
    expect(activeUi).not.toContain('近日')
    expect(activeUi).not.toContain('7日以内なら復元')
    expect(activeUi).not.toContain('復元できます')
  })

  it('keeps privacy and evidence promises conservative', () => {
    const activeUi = `${settingsSource}\n${settingsTrustCenterCopySource}\n${onboardingSource}`

    expect(settingsTrustCenterCopySource).toContain('AI を使わない選択を残したまま')
    expect(settingsTrustCenterCopySource).toContain('登録した呼び名')
    expect(settingsTrustCenterCopySource).toContain('画像URL / presigned URL / 保存先のキー')
    expect(settingsTrustCenterCopySource).toContain('実名・メール・生年月日')
    expect(settingsTrustCenterCopySource).toContain('prompt・AI生成本文')
    expect(settingsTrustCenterCopySource).toContain('商用 API 条件')
    expect(settingsTrustCenterCopySource).toContain('プライバシーレビュー')
    expect(settingsTrustCenterCopySource).not.toContain('通常30日以内に削除されます')
    expect(settingsTrustCenterCopySource).toContain(
      '完全削除や復元可能期間は、この画面では約束しません。',
    )
    expect(planSource).toContain('実写真、production data、画像 URL、`storage_key`')
    expect(planSource).toContain('未実装機能は active UI で「近日対応」')

    expect(activeUi).not.toMatch(/zero data retention/i)
    expect(activeUi).not.toContain('完全に削除されます')
    expect(activeUi).not.toContain('子どもの写真は外に出ません')
    expect(activeUi).not.toContain('個人情報は送信しません')
  })
})
