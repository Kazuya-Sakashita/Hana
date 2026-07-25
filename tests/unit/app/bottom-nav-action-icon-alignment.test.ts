import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bottomNavSource = readFileSync(
  new URL('../../../src/components/bottom-nav.tsx', import.meta.url),
  'utf8',
)
const iconsSource = readFileSync(
  new URL('../../../src/components/product/icons.tsx', import.meta.url),
  'utf8',
)
const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)
const toastSource = readFileSync(
  new URL('../../../src/components/ui/toast.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-079-bottomnav-action-icon-alignment.md', import.meta.url),
  'utf8',
)

describe('ISSUE-079 BottomNav and action icon alignment', () => {
  it('moves the record action from a plus glyph to ImagePlus quiet icon language', () => {
    expect(bottomNavSource).toContain('ImagePlus')
    expect(bottomNavSource).toContain('function RecordAction')
    expect(bottomNavSource).toContain('data-testid="bottom-nav-record-action"')
    expect(bottomNavSource).toContain(
      'QuietIcon icon={ImagePlus} tone="onPrimary" size="lg" active',
    )
    expect(bottomNavSource).not.toContain('import { BookOpen, Home, Plus')
    expect(bottomNavSource).not.toContain('<Plus')
  })

  it('keeps BottomNav target size, safe area, hidden paths, and non-overlapping layout', () => {
    expect(bottomNavSource).toContain('pb-safe')
    expect(bottomNavSource).toContain(
      "const HIDDEN_PATHS = ['/sign-in', '/auth/callback', '/onboarding', '/record']",
    )
    expect(bottomNavSource).toContain('prefetch={false}')
    expect(bottomNavSource).toContain('prefetch={true}')
    expect(bottomNavSource).toContain('tap-target')
    expect(bottomNavSource).toContain('h-14 w-14')
    expect(bottomNavSource).toContain('grid-cols-[1fr_1fr_72px_1fr_1fr]')
    expect(bottomNavSource).toContain('<span aria-hidden="true" />')
    expect(bottomNavSource).not.toContain('absolute left-1/2 top-0')
    expect(bottomNavSource).not.toContain('backdrop-blur')
  })

  it('adds a visible active indicator that is not color-only', () => {
    expect(bottomNavSource).toContain('aria-current={active ?')
    expect(bottomNavSource).toContain('data-active-indicator')
    expect(bottomNavSource).toContain('bg-paper-slip shadow-soft')
    expect(bottomNavSource).toContain("tone={active ? 'primary' : 'muted'}")
    expect(bottomNavSource).toContain('active={active}')
  })

  it('keeps favorite fill as the only active fill exception through QuietIcon', () => {
    expect(iconsSource).toContain("favorite: 'text-ink-tertiary'")
    expect(iconsSource).toContain("tone === 'favorite' && active ? 'currentColor' : 'none'")
    expect(iconsSource).toContain("tone === 'favorite' && active ? 'text-sakura-deep'")
    expect(albumListSource).toContain(
      'QuietIcon icon={Heart} tone="favorite" active={memory.is_favorite}',
    )
    expect(albumListSource).not.toContain('hover:text-sakura')
    expect(memoryActionsSource).toContain('QuietIcon icon={icon} tone={tone} active={active}')
    expect(memoryActionsSource).toContain('icon={Heart}')
    expect(memoryActionsSource).toContain('tone="favorite"')
    expect(memoryActionsSource).toContain('icon={Trash2}')
    expect(memoryActionsSource).not.toContain('fill={isFavorite')
  })

  it('keeps toast close and issue evidence safety within scope', () => {
    expect(toastSource).toContain('QuietIconButton')
    expect(toastSource).toContain('label="toast を とじる"')
    expect(issueSource).toContain('github_issue: 177')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('API / DB / Auth / Storage / OpenAPI の変更')
    expect(issueSource).toContain(
      'Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メール',
    )
  })
})
