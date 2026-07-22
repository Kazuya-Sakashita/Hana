import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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

describe('delete restore trust contract', () => {
  it('keeps active delete confirmation free of restore promises', () => {
    expect(memoryActionsSource).toContain('アルバムに')
    expect(memoryActionsSource).toContain('表示されなくなります')
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
  })
})
