import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deleteMemoryDescription } from '@/lib/ui/quiet-state-copy'

const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)
const trustContract = readFileSync(
  new URL('../../../docs/design/delete-restore-trust-contract.md', import.meta.url),
  'utf8',
)
const securityGuide = readFileSync(
  new URL('../../../docs/api-driven-development/security-and-privacy.md', import.meta.url),
  'utf8',
)
const openApiSource = readFileSync(
  new URL('../../../docs/openapi/openapi.yaml', import.meta.url),
  'utf8',
)

describe('delete restore trust contract', () => {
  it('keeps active delete confirmation free of restore promises', () => {
    expect(memoryActionsSource).toContain('deleteMemoryDescription(childName)')
    expect(deleteMemoryDescription('はな')).toContain('アルバムに')
    expect(deleteMemoryDescription('はな')).toContain('表示されなくなります')
    expect(memoryActionsSource).not.toContain('7にち')
    expect(memoryActionsSource).not.toContain('7日')
    expect(memoryActionsSource).not.toContain('もどせます')
    expect(memoryActionsSource).not.toContain('復元')
  })

  it('documents logical delete separately from product restore availability', () => {
    expect(trustContract).toContain('logical deletion')
    expect(trustContract).toContain('No restore screen exists')
    expect(trustContract).toContain('Active UI must not say users can restore it themselves')
    expect(trustContract).toContain('Do not claim "7 days"')
    expect(securityGuide).toContain('docs/design/delete-restore-trust-contract.md')
    expect(securityGuide).toContain('memory restore is promised without restore UI')
    expect(openApiSource).toContain(
      '復元は、レビュー済みの UI / API / サポートフローが揃うまで提供しない',
    )
    expect(openApiSource).not.toContain('30 日以内なら復活可能')
  })
})
