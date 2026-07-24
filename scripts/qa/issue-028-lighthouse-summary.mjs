#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_CDP_PORT = 9222
const DEFAULT_LIGHTHOUSE_BIN = 'lighthouse'
const BASELINE_MEMORY_LCP_MS = 22900

const METRIC_AUDITS = {
  firstContentfulPaint: 'first-contentful-paint',
  largestContentfulPaint: 'largest-contentful-paint',
  totalBlockingTime: 'total-blocking-time',
  cumulativeLayoutShift: 'cumulative-layout-shift',
  speedIndex: 'speed-index',
}

export function parseArgs(args) {
  const out = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    if (arg === '--') {
      continue
    } else if (arg === '--base-url' && next) {
      out.baseUrl = next
      i++
    } else if (arg === '--path' && next) {
      out.path = next
      i++
    } else if (arg === '--input' && next) {
      out.input = next
      i++
    } else if (arg === '--cdp-port' && next) {
      out.cdpPort = Number(next)
      i++
    } else if (arg === '--lighthouse-bin' && next) {
      out.lighthouseBin = next
      i++
    } else if (arg === '--self-test') {
      out.selfTest = true
    } else if (arg === '--help') {
      out.help = true
    } else {
      throw new Error('Unknown or incomplete option. Run with --help for usage.')
    }
  }

  return out
}

export function readConfig(args, env = process.env) {
  const parsed = parseArgs(args)
  const baseUrl = normalizeBaseUrl(parsed.baseUrl ?? env.HANA_QA_BASE_URL ?? DEFAULT_BASE_URL)
  const pagePath = normalizePagePath(parsed.path ?? env.HANA_QA_PAGE_PATH ?? '')
  const input = parsed.input ?? env.HANA_QA_LIGHTHOUSE_INPUT ?? ''
  const cdpPort = readPort(parsed.cdpPort ?? env.HANA_QA_CDP_PORT ?? DEFAULT_CDP_PORT)
  const lighthouseBin = parsed.lighthouseBin ?? env.HANA_QA_LIGHTHOUSE_BIN ?? DEFAULT_LIGHTHOUSE_BIN

  if (!input && !pagePath) {
    throw new Error('either --input or --path is required')
  }

  return {
    baseUrl,
    pagePath,
    input,
    cdpPort,
    lighthouseBin,
    selfTest: parsed.selfTest === true,
    help: parsed.help === true,
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('base URL must not include credentials, query, or fragment')
  }
  return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href
}

function normalizePagePath(value) {
  if (!value) return ''
  if (!value.startsWith('/')) {
    throw new Error('path must start with /')
  }
  const parsed = new URL(value, 'http://local.invalid')
  if (parsed.search || parsed.hash) {
    throw new Error('path must not include query or fragment')
  }
  return parsed.pathname
}

function readPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('CDP port must be an integer from 1 to 65535')
  }
  return port
}

export function summarizeLighthouse(lhr) {
  const url = safeUrl(lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? '')
  const categories = lhr.categories ?? {}
  const audits = lhr.audits ?? {}
  const metrics = {
    performanceScore: readScore(categories.performance?.score),
    fcpMs: readNumericValue(audits[METRIC_AUDITS.firstContentfulPaint]),
    lcpMs: readNumericValue(audits[METRIC_AUDITS.largestContentfulPaint]),
    tbtMs: readNumericValue(audits[METRIC_AUDITS.totalBlockingTime]),
    cls: readNumericValue(audits[METRIC_AUDITS.cumulativeLayoutShift]),
    speedIndexMs: readNumericValue(audits[METRIC_AUDITS.speedIndex]),
  }
  const properlySizeImages = summarizeAudit(audits['uses-responsive-images'])
  const pagePath = redactPath(url?.pathname ?? '')

  return {
    measurement: 'Lighthouse mobile sanitized summary',
    isLighthouse: true,
    rawReportStored: false,
    privacy:
      'Raw URLs, signed tokens, storage keys, titles, body text, child names, and memory IDs are not printed.',
    target: {
      origin: url ? url.origin : null,
      path: pagePath || null,
    },
    lighthouse: {
      lighthouseVersion: typeof lhr.lighthouseVersion === 'string' ? lhr.lighthouseVersion : null,
      fetchTime: typeof lhr.fetchTime === 'string' ? lhr.fetchTime : null,
      formFactor: lhr.configSettings?.formFactor ?? null,
      throttlingMethod: lhr.configSettings?.throttlingMethod ?? null,
    },
    metrics,
    audits: {
      properlySizeImages,
    },
    baselineComparison:
      pagePath === '/memory/<redacted-memory-id>' && metrics.lcpMs !== null
        ? {
            baselineFile: 'docs/perf/baseline-2026-05-27.md',
            baselineMemoryDetailLcpMs: BASELINE_MEMORY_LCP_MS,
            deltaMs: Math.round(metrics.lcpMs - BASELINE_MEMORY_LCP_MS),
            deltaPercent: Number(
              (((metrics.lcpMs - BASELINE_MEMORY_LCP_MS) / BASELINE_MEMORY_LCP_MS) * 100).toFixed(
                1,
              ),
            ),
          }
        : null,
  }
}

function safeUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function readScore(score) {
  return typeof score === 'number' ? Number(score.toFixed(3)) : null
}

function readNumericValue(audit) {
  return typeof audit?.numericValue === 'number' ? Number(audit.numericValue.toFixed(4)) : null
}

function summarizeAudit(audit) {
  if (!audit) {
    return {
      id: 'uses-responsive-images',
      title: 'Properly size images',
      status: 'missing',
      score: null,
      numericValue: null,
      displayValue: null,
      wastedBytes: null,
      itemCount: null,
    }
  }

  const items = Array.isArray(audit.details?.items) ? audit.details.items : []
  return {
    id: audit.id ?? 'uses-responsive-images',
    title: audit.title ?? 'Properly size images',
    status: classifyAuditStatus(audit.score),
    score: readScore(audit.score),
    numericValue: readNumericValue(audit),
    displayValue: typeof audit.displayValue === 'string' ? audit.displayValue : null,
    wastedBytes: readWastedBytes(audit, items),
    itemCount: items.length,
  }
}

function classifyAuditStatus(score) {
  if (score === null) return 'not_applicable'
  if (typeof score !== 'number') return 'unknown'
  return score >= 0.9 ? 'pass' : 'fail'
}

function readWastedBytes(audit, items) {
  if (typeof audit.numericValue === 'number') return Math.round(audit.numericValue)
  const total = items.reduce((sum, item) => {
    const value = Number(item?.wastedBytes)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
  return total > 0 ? Math.round(total) : null
}

function redactPath(pathname) {
  if (!pathname) return ''
  return pathname.replace(/\/memory\/[^/]+/g, '/memory/<redacted-memory-id>')
}

export function runLighthouse(config) {
  const url = `${config.baseUrl}${config.pagePath}`
  const result = spawnSync(
    config.lighthouseBin,
    [
      url,
      '--quiet',
      '--output=json',
      '--output-path=stdout',
      '--only-categories=performance',
      '--form-factor=mobile',
      '--screenEmulation.mobile=true',
      '--screenEmulation.width=390',
      '--screenEmulation.height=844',
      '--screenEmulation.deviceScaleFactor=3',
      '--disable-storage-reset',
      `--port=${config.cdpPort}`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      'Lighthouse run failed. Ensure Lighthouse is installed, Chrome CDP is running, and the authenticated page can be opened.',
    )
  }

  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error('Lighthouse output was not valid JSON')
  }
}

export function runSelfTest() {
  const sample = {
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
  }

  const summary = summarizeLighthouse(sample)
  const serialized = JSON.stringify(summary)
  for (const leak of [
    'self-test-memory-id',
    'secret-token',
    'private_preview.webp',
    'uploads/user',
  ]) {
    if (serialized.includes(leak)) {
      throw new Error(`self-test failed: leaked ${leak}`)
    }
  }
  if (summary.target.path !== '/memory/<redacted-memory-id>') {
    throw new Error('self-test failed: memory path was not redacted')
  }
  if (summary.audits.properlySizeImages.status !== 'pass') {
    throw new Error('self-test failed: properly-size-images should pass')
  }
}

function printHelp() {
  console.log(`Usage: node scripts/qa/issue-028-lighthouse-summary.mjs [options]

Options:
  --base-url <url>          App URL (default: HANA_QA_BASE_URL or ${DEFAULT_BASE_URL})
  --path <path>             Page path to audit, e.g. /memory/<id> (default: HANA_QA_PAGE_PATH)
  --input <file>            Read an existing Lighthouse JSON report and print a sanitized summary
  --cdp-port <port>         Chrome DevTools port (default: HANA_QA_CDP_PORT or ${DEFAULT_CDP_PORT})
  --lighthouse-bin <path>   Lighthouse executable (default: HANA_QA_LIGHTHOUSE_BIN or ${DEFAULT_LIGHTHOUSE_BIN})
  --self-test               Run sanitizer self-test without opening Chrome
  --help                    Show this message
`)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.help) {
      printHelp()
      process.exit(0)
    }
    if (parsed.selfTest) {
      runSelfTest()
      console.log('issue-028-lighthouse-summary self-test OK')
      process.exit(0)
    }

    const config = readConfig(process.argv.slice(2))
    const lhr = config.input
      ? JSON.parse(readFileSync(config.input, 'utf8'))
      : runLighthouse(config)
    console.log(JSON.stringify(summarizeLighthouse(lhr), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
