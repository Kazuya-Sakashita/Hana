import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routes = [
  ['src/app/page.tsx', 'ホーム | Hana'],
  ['src/app/record/layout.tsx', '記録をつくる | Hana'],
  ['src/app/album/page.tsx', 'アルバム | Hana'],
  ['src/app/memory/[memoryId]/page.tsx', '記録のページ | Hana'],
  ['src/app/settings/layout.tsx', '設定 | Hana'],
  ['src/app/sign-in/layout.tsx', 'サインイン | Hana'],
  ['src/app/onboarding/layout.tsx', 'はじめの設定 | Hana'],
] as const

describe('private route metadata', () => {
  it.each(routes)('%s uses a fixed privacy-safe title', (file, title) => {
    const source = readFileSync(file, 'utf8')
    expect(source).toContain(`title: '${title}'`)
    expect(source).not.toMatch(/metadata[\s\S]{0,300}(child|memory)\.(name|title|body)/)
  })

  it('keeps the public metadata contracts', () => {
    expect(readFileSync('src/app/lp/page.tsx', 'utf8')).toContain(
      "title: 'Hana | 写真1枚から、30秒で残す育児記録'",
    )
    expect(readFileSync('src/app/privacy/page.tsx', 'utf8')).toContain(
      "title: 'プライバシーポリシー | Hana'",
    )
  })
})
