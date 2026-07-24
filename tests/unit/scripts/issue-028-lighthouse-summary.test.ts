import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/qa/issue-028-lighthouse-summary.mjs',
)

describe('issue-028-lighthouse-summary', () => {
  it('passes the built-in self-test without opening Chrome', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('self-test OK')
    expect(result.stderr).toBe('')
  })

  it('prints help without requiring Lighthouse or a CDP target', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--help'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('HANA_QA_PAGE_PATH')
    expect(result.stderr).toBe('')
  })

  it('summarizes an existing report without leaking raw URLs or memory IDs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hana-lighthouse-summary-'))
    const input = path.join(dir, 'lighthouse.json')

    try {
      writeFileSync(
        input,
        JSON.stringify({
          lighthouseVersion: '13.0.0',
          fetchTime: '2026-07-24T00:00:00.000Z',
          finalDisplayedUrl: 'http://localhost:3000/memory/self-test-memory-id?token=secret-token',
          configSettings: {
            formFactor: 'mobile',
            throttlingMethod: 'simulate',
          },
          categories: {
            performance: { score: 0.74 },
          },
          audits: {
            'first-contentful-paint': { numericValue: 1400 },
            'largest-contentful-paint': { numericValue: 1900 },
            'total-blocking-time': { numericValue: 80 },
            'cumulative-layout-shift': { numericValue: 0.0003 },
            'speed-index': { numericValue: 3100 },
            'uses-responsive-images': {
              id: 'uses-responsive-images',
              title: 'Properly size images',
              score: 1,
              numericValue: 0,
              displayValue: 'Potential savings of 0 KiB',
              details: {
                items: [
                  {
                    url: 'https://demo.supabase.co/storage/v1/object/sign/images/uploads/user/private_preview.webp?token=secret-token',
                    wastedBytes: 0,
                  },
                ],
              },
            },
          },
        }),
      )

      const result = spawnSync(process.execPath, [SCRIPT, '--input', input], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      const summary = JSON.parse(result.stdout)
      expect(summary.lighthouse.baselineComparable).toBe(true)
      expect(summary.baselineComparison).not.toBeNull()
      expect(result.stdout).toContain('/memory/<redacted-memory-id>')
      expect(result.stdout).toContain('Properly size images')
      expect(result.stdout).not.toContain('self-test-memory-id')
      expect(result.stdout).not.toContain('secret-token')
      expect(result.stdout).not.toContain('private_preview.webp')
      expect(result.stdout).not.toContain('uploads/user')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not compare against the mobile simulated baseline for non-comparable reports', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hana-lighthouse-summary-'))
    const input = path.join(dir, 'lighthouse.json')

    try {
      writeFileSync(
        input,
        JSON.stringify({
          finalDisplayedUrl: 'http://localhost:3000/memory/self-test-memory-id',
          configSettings: {
            formFactor: 'desktop',
            throttlingMethod: 'provided',
          },
          categories: {
            performance: { score: 0.9 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 1800 },
          },
        }),
      )

      const result = spawnSync(process.execPath, [SCRIPT, '--input', input], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      const summary = JSON.parse(result.stdout)
      expect(summary.lighthouse.baselineComparable).toBe(false)
      expect(summary.baselineComparison).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('supports the Lighthouse 13 image delivery insight audit', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hana-lighthouse-summary-'))
    const input = path.join(dir, 'lighthouse.json')

    try {
      writeFileSync(
        input,
        JSON.stringify({
          finalDisplayedUrl: 'http://localhost:3000/memory/self-test-memory-id',
          configSettings: {
            formFactor: 'mobile',
            throttlingMethod: 'simulate',
          },
          categories: {
            performance: { score: 0.91 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 2532.361 },
            'image-delivery-insight': {
              id: 'image-delivery-insight',
              title: 'Improve image delivery',
              score: 1,
              details: {
                type: 'table',
                items: [],
              },
            },
          },
        }),
      )

      const result = spawnSync(process.execPath, [SCRIPT, '--input', input], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      const summary = JSON.parse(result.stdout)
      expect(summary.audits.properlySizeImages).toMatchObject({
        id: 'image-delivery-insight',
        title: 'Improve image delivery',
        status: 'pass',
        score: 1,
        itemCount: 0,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not echo malformed raw report snippets', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hana-lighthouse-summary-'))
    const input = path.join(dir, 'lighthouse.json')

    try {
      writeFileSync(input, '{"secret":"secret-token","url":"storage_key/private_preview.webp"')

      const result = spawnSync(process.execPath, [SCRIPT, '--input', input], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Lighthouse input was not valid JSON')
      expect(result.stderr).not.toContain('secret-token')
      expect(result.stderr).not.toContain('storage_key')
      expect(result.stderr).not.toContain('private_preview.webp')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects token-bearing inputs without echoing the token', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--base-url', 'http://user:secret-token@localhost:3000/?token=query-secret'],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('base URL must not include credentials')
    expect(result.stderr).not.toContain('secret-token')
    expect(result.stderr).not.toContain('query-secret')
  })

  it('can be imported when process.argv[1] is unavailable', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `process.argv[1] = undefined; await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
      ],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })
})
