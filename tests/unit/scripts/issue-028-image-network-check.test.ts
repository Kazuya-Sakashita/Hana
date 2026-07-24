import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/qa/issue-028-image-network-check.mjs',
)

describe('issue-028-image-network-check', () => {
  it('passes the built-in self-test without opening Chrome', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('self-test OK')
    expect(result.stderr).toBe('')
  })

  it('accepts a package-manager argument delimiter before flags', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--', '--self-test'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('self-test OK')
    expect(result.stderr).toBe('')
  })

  it('prints help without requiring a CDP target', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--help'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('HANA_QA_MEMORY_PATH')
    expect(result.stderr).toBe('')
  })

  it('rejects token-bearing base URLs without echoing secrets', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--base-url', 'http://user:secret-token@localhost:3000/?token=query-secret'],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must not include credentials, query, or fragment')
    expect(result.stderr).not.toContain('secret-token')
    expect(result.stderr).not.toContain('query-secret')
  })

  it('rejects token-bearing memory paths without echoing secrets', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--memory-path', '/memory/abc?token=memory-secret'],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('memory path must not include query or fragment')
    expect(result.stderr).not.toContain('memory-secret')
  })

  it('does not echo unknown positional arguments', () => {
    const result = spawnSync(process.execPath, [SCRIPT, 'https://example.test/?token=leaky'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown or incomplete option')
    expect(result.stderr).not.toContain('leaky')
  })
})
