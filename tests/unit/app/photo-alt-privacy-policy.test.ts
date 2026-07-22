import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const detailSource = readFileSync(
  new URL('../../../src/app/memory/[memoryId]/page.tsx', import.meta.url),
  'utf8',
)
const policySource = readFileSync(
  new URL('../../../docs/design/photo-alt-privacy-policy.md', import.meta.url),
  'utf8',
)

describe('photo alt privacy policy', () => {
  it('keeps linked thumbnails decorative when visible titles already label the item', () => {
    expect(homeSource).toContain('alt=""')
    expect(homeSource).not.toContain('alt={m.title}')
    expect(albumListSource).toContain('alt=""')
    expect(albumListSource).not.toContain('alt={memory.title}')
    expect(albumListSource).not.toContain('alt: string')
  })

  it('gives detail hero photos a generic non-empty alt without inferred contents', () => {
    expect(detailSource).toContain('alt="記録のしゃしん"')
    expect(detailSource).not.toContain('alt=""')
    expect(detailSource).not.toContain('alt={memory.title}')
    expect(detailSource).not.toContain('alt={memory.body}')
  })

  it('documents privacy-preserving alt rules and future review needs', () => {
    expect(policySource).toContain('avoid guessing details')
    expect(policySource).toContain('Decorative alt (`alt=""`)')
    expect(policySource).toContain('Generic alt (`記録のしゃしん`)')
    expect(policySource).toContain('Do not infer what is in a child photo')
    expect(policySource).toContain('privacy review for real child data')
  })
})
