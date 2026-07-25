const { join } = require('node:path')
const { statSync } = require('node:fs')

const issue = 'ISSUE-075'
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'

const targetSurfaces = [
  {
    id: 'lp',
    path: '/lp',
    requiredSelectors: ['[data-public-lp="waitlist"]', '#waitlist-form', 'a[href="/privacy"]'],
  },
  {
    id: 'privacy',
    path: '/privacy',
    requiredSelectors: ['main h1', 'section[aria-label="待機リスト登録情報の扱い"]'],
  },
]

const publicLpImage = '/lp/hana-before-after-safe-still-life.svg'

const viewportMatrix = [
  { id: 'compact-phone', width: 390, height: 844 },
  { id: 'large-phone', width: 430, height: 932 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1280, height: 900 },
]

const interactiveSelector = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const checkList = [
  'public-route-load',
  'heading-order',
  'tap-targets',
  'interactive-overlap',
  'focus-order',
  'visible-focus',
  'horizontal-overflow',
  'reduced-motion',
  'waitlist-submit-with-redacted-mock',
  'no-js-fallback',
  'image-payload',
  'lcp-timing',
  'evidence-safety',
]

function argValue(name, fallback) {
  const exact = process.argv.find((arg) => arg === name)
  if (exact) return true
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function requirePlaywright() {
  try {
    return require('playwright')
  } catch (error) {
    const runtimeNodeModules = process.env.CODEX_RUNTIME_NODE_MODULES
    if (!runtimeNodeModules) {
      throw new Error(
        'playwright_unavailable: set CODEX_RUNTIME_NODE_MODULES to a node_modules directory that contains playwright, or install playwright before app mode',
      )
    }
    return require(join(runtimeNodeModules, 'playwright'))
  }
}

function testMail() {
  return ['qa', ['example', 'test'].join('.')].join('@')
}

function redactedBaseUrl() {
  return baseUrl.replace(/:\/\/[^/]+/, '://<redacted-host>')
}

async function installWaitlistMock(page) {
  await page.route('**/v1/waitlist', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }

    const payload = request.postDataJSON()
    if (
      typeof payload.email !== 'string' ||
      payload.consent !== true ||
      payload.source !== 'current-lp' ||
      payload.privacy_policy_version !== 'prelaunch-2026-07-25'
    ) {
      await route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 422, reason: 'validation_error' }),
      })
      return
    }

    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'accepted' }),
    })
  })
}

async function assertLoadedTarget(page, target, response) {
  await page.waitForLoadState('domcontentloaded')
  const status = response?.status() ?? null
  if (typeof status === 'number' && status >= 400) {
    throw new Error(`${target.id}: route_status_${status}`)
  }

  const currentPath = new URL(page.url()).pathname
  if (currentPath !== target.path) {
    throw new Error(`${target.id}: unexpected_path`)
  }

  for (const selector of target.requiredSelectors) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 })
  }
}

async function assertHeadingOrder(page, target) {
  const result = await page.evaluate(() => {
    function isVisibleElement(element) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]')
      )
    }

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
      isVisibleElement,
    )
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)))
    const jumps = []
    for (let index = 1; index < levels.length; index += 1) {
      if (levels[index] - levels[index - 1] > 1) {
        jumps.push({ from: levels[index - 1], to: levels[index] })
      }
    }
    return {
      h1Count: levels.filter((level) => level === 1).length,
      jumps,
    }
  })

  if (result.h1Count !== 1) throw new Error(`${target.id}: h1_count_${result.h1Count}`)
  if (result.jumps.length > 0) throw new Error(`${target.id}: heading_jump`)
}

async function collectTapTargets(page) {
  return page.$$eval(interactiveSelector, (elements) => {
    function effectiveTarget(element) {
      const type = element.getAttribute('type')
      if ((type === 'checkbox' || type === 'radio') && element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
        if (label) return label
      }
      return element.closest('label') ?? element
    }

    function isVisibleElement(element) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]')
      )
    }

    const visible = elements
      .filter(isVisibleElement)
      .filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
      )
      .map((element, index) => {
        const rect = effectiveTarget(element).getBoundingClientRect()
        return {
          element_index: index,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })

    return {
      count: visible.length,
      failures: visible.filter((element) => element.width < 44 || element.height < 44),
    }
  })
}

async function assertTapTargets(page, target) {
  const result = await collectTapTargets(page)
  if (result.failures.length > 0) throw new Error(`${target.id}: small_tap_targets`)
  return result.count
}

async function assertHorizontalOverflow(page, target) {
  const overflow = await page.evaluate(() => {
    function isVisibleElement(element) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]')
      )
    }

    const documentOverflow =
      document.documentElement.scrollWidth > window.innerWidth + 1 ? [{ source: 'document' }] : []

    const elementOverflow = Array.from(document.querySelectorAll('body *'))
      .filter(isVisibleElement)
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left < -1 || rect.right > window.innerWidth + 1
      })
      .map((element, index) => ({ element_index: index, tag: element.tagName.toLowerCase() }))

    return [...documentOverflow, ...elementOverflow]
  })

  if (overflow.length > 0) throw new Error(`${target.id}: horizontal_overflow`)
}

async function assertInteractiveOverlap(page, target) {
  const overlaps = await page.$$eval(interactiveSelector, (elements) => {
    function effectiveTarget(element) {
      const type = element.getAttribute('type')
      if ((type === 'checkbox' || type === 'radio') && element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
        if (label) return label
      }
      return element.closest('label') ?? element
    }

    function isVisibleElement(element) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]')
      )
    }

    const rects = elements.filter(isVisibleElement).map((element, index) => {
      const rect = effectiveTarget(element).getBoundingClientRect()
      return {
        index,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
    const failures = []
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const x = Math.max(
          0,
          Math.min(rects[a].right, rects[b].right) - Math.max(rects[a].left, rects[b].left),
        )
        const y = Math.max(
          0,
          Math.min(rects[a].bottom, rects[b].bottom) - Math.max(rects[a].top, rects[b].top),
        )
        if (x * y > 8) failures.push({ a: rects[a].index, b: rects[b].index })
      }
    }
    return failures
  })

  if (overlaps.length > 0) throw new Error(`${target.id}: interactive_overlap`)
}

async function activeElementDescriptor(page) {
  return page.evaluate((selector) => {
    const element = document.activeElement
    if (!element || element === document.body || element.id === 'nextjs-portal') return null
    const focusables = Array.from(document.querySelectorAll(selector)).filter((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const style = window.getComputedStyle(candidate)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        candidate.getAttribute('aria-hidden') !== 'true' &&
        !candidate.closest('[hidden], [aria-hidden="true"], [inert]')
      )
    })
    return {
      element_index: focusables.indexOf(element),
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      type: element.getAttribute('type'),
    }
  }, interactiveSelector)
}

async function assertVisibleFocus(page, target) {
  const visited = []
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab')
    const descriptor = await activeElementDescriptor(page)
    if (!descriptor) continue
    const style = await page.evaluate(() => {
      const element = document.activeElement
      if (!element || element === document.body) return null
      const computed = window.getComputedStyle(element)
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        boxShadow: computed.boxShadow,
      }
    })
    if (!style) continue
    const hasVisibleFocus =
      (style.outlineStyle && style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
      (style.boxShadow && style.boxShadow !== 'none')
    visited.push(descriptor)
    if (!hasVisibleFocus) throw new Error(`${target.id}: invisible_focus`)
  }

  if (visited.length < 1) throw new Error(`${target.id}: no_focus_stops`)
  return visited.length
}

async function assertReducedMotion(page, target) {
  const animated = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getAttribute('aria-hidden') !== 'true' &&
          !element.closest('[hidden], [aria-hidden="true"], [inert]')
        )
      })
      .map((element, index) => {
        const style = window.getComputedStyle(element)
        return {
          element_index: index,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
        }
      })
      .filter((item) => item.animationName !== 'none')
      .filter((item) =>
        item.animationDuration.split(',').some((duration) => Number.parseFloat(duration) > 0.05),
      ),
  )

  if (animated.length > 0) throw new Error(`${target.id}: reduced_motion_animation`)
}

async function assertEvidenceSafety(page, target) {
  const leak = await page.evaluate(() => {
    const text = document.body.innerText
    const patterns = [
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /https?:\/\/(?!(?:hana\.app\/problems\/|localhost:|127\.0\.0\.1:))/i,
      /storage[_-]?key|presigned[_-]?url|prompt\s*[:=]|AI生成本文/,
      /zero data retention|0-day|復元可能/i,
    ]
    return patterns.some((pattern) => pattern.test(text))
  })
  if (leak) throw new Error(`${target.id}: evidence_leak`)
}

async function assertWaitlistSubmit(page, target) {
  if (target.id !== 'lp') return false
  await page.fill('#waitlist-email', testMail())
  await page.check('#waitlist-consent')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => {
    const status = document.querySelector('#waitlist-status')
    return Boolean(status?.textContent?.includes('登録を受け付けました'))
  })
  return true
}

async function collectImagePayload(page) {
  const payload = await page.evaluate((publicImagePath) => {
    const resources = performance
      .getEntriesByType('resource')
      .filter(
        (entry) =>
          entry.initiatorType === 'img' ||
          new URL(entry.name).pathname.startsWith('/_next/image') ||
          new URL(entry.name).pathname === publicImagePath,
      )
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        transfer_size: Math.max(0, Math.round(entry.transferSize)),
        encoded_body_size: Math.max(0, Math.round(entry.encodedBodySize)),
      }))
    const domImages = Array.from(document.images).map((image) => ({
      path: new URL(image.currentSrc || image.src, window.location.href).pathname,
      complete: image.complete,
      natural_width: image.naturalWidth,
      natural_height: image.naturalHeight,
    }))
    return { resources, domImages }
  }, publicLpImage)

  const staticAssetBytes = statSync(join(process.cwd(), 'public', publicLpImage)).size

  return {
    resources: payload.resources,
    dom_images: payload.domImages,
    static_asset_bytes: staticAssetBytes,
    total_transfer_size: payload.resources.reduce((sum, item) => sum + item.transfer_size, 0),
    total_encoded_body_size: payload.resources.reduce(
      (sum, item) => sum + item.encoded_body_size,
      0,
    ),
  }
}

async function collectLcp(page) {
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    if (window.__hanaLcp) return window.__hanaLcp
    const entries = performance.getEntriesByType('largest-contentful-paint')
    const latest = entries.at(-1)
    if (!latest) return null
    return {
      start_time_ms: Math.round(latest.startTime),
      size: Math.round(latest.size ?? 0),
    }
  })
}

async function assertNoJsFallback(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  })
  try {
    const page = await context.newPage()
    const response = await page.goto(new URL('/lp', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('domcontentloaded')
    if ((response?.status() ?? 500) >= 400) throw new Error('no_js_route_status')
    await page.locator('[data-public-lp="waitlist"]').waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.locator('text=待機リスト登録には JavaScript が必要です').waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    const formVisible = await page.locator('#waitlist-form').isVisible()
    if (formVisible) throw new Error('no_js_form_visible')
  } finally {
    await context.close()
  }
}

async function assertPage(page, target, response) {
  await assertLoadedTarget(page, target, response)
  await assertHeadingOrder(page, target)
  const interactiveCount = await assertTapTargets(page, target)
  await assertInteractiveOverlap(page, target)
  await assertHorizontalOverflow(page, target)
  const focusStops = await assertVisibleFocus(page, target)
  await assertReducedMotion(page, target)
  await assertEvidenceSafety(page, target)
  const waitlistMocked = await assertWaitlistSubmit(page, target)
  const imagePayload = await collectImagePayload(page)
  const lcp = await collectLcp(page)

  return {
    interactive_count: interactiveCount,
    focus_stops_checked: focusStops,
    waitlist_submit_mocked: waitlistMocked,
    image_payload: imagePayload,
    lcp,
  }
}

function assertContract() {
  const paths = targetSurfaces.map((target) => target.path)
  for (const path of ['/lp', '/privacy']) {
    if (!paths.includes(path)) throw new Error(`missing_target_${path}`)
  }

  for (const width of [390, 430, 768, 1280]) {
    if (!viewportMatrix.some((viewport) => viewport.width === width)) {
      throw new Error(`missing_viewport_${width}`)
    }
  }

  for (const requiredSelector of [
    'summary',
    '[role="button"]',
    '[tabindex]:not([tabindex="-1"])',
  ]) {
    if (!interactiveSelector.includes(requiredSelector)) {
      throw new Error(`interactive_selector_missing_${requiredSelector}`)
    }
  }

  for (const check of [
    'tap-targets',
    'visible-focus',
    'horizontal-overflow',
    'reduced-motion',
    'no-js-fallback',
    'image-payload',
    'lcp-timing',
    'evidence-safety',
  ]) {
    if (!checkList.includes(check)) throw new Error(`missing_check_${check}`)
  }

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    artifact_policy:
      'read-only: no screenshot, accessibility snapshot, trace, HAR, or QA evidence file is written',
    target_surfaces: targetSurfaces,
    viewports: viewportMatrix,
    interactive_selector: interactiveSelector,
    checks: checkList,
  }
}

async function runAppSmoke() {
  const { chromium } = requirePlaywright()
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    for (const target of targetSurfaces) {
      for (const viewport of viewportMatrix) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: 'reduce',
        })
        const page = await context.newPage()
        await page.addInitScript(() => {
          window.__hanaLcp = null
          try {
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              const latest = entries.at(-1)
              if (!latest) return
              window.__hanaLcp = {
                start_time_ms: Math.round(latest.startTime),
                size: Math.round(latest.size ?? 0),
              }
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
          } catch {
            window.__hanaLcp = null
          }
        })
        await installWaitlistMock(page)
        const response = await page.goto(new URL(target.path, baseUrl).toString(), {
          waitUntil: 'domcontentloaded',
        })
        const result = await assertPage(page, target, response)
        results.push({
          target: target.id,
          path: target.path,
          viewport: `${viewport.width}x${viewport.height}`,
          result: 'pass',
          ...result,
        })
        await context.close()
      }
    }

    await assertNoJsFallback(browser)
  } finally {
    await browser.close()
  }

  return {
    issue,
    mode: 'app',
    base_url: redactedBaseUrl(),
    result: 'pass',
    evidence: 'redacted-dom-performance-summary',
    artifact_policy:
      'read-only: no screenshot, accessibility snapshot, trace, HAR, or QA evidence file is written',
    no_js_fallback: 'pass',
    results,
  }
}

function safeFailureMessage(error) {
  const message = error instanceof Error ? error.message : 'unknown_failure'
  const firstLine = message.split('\n')[0] ?? 'unknown_failure'
  const hasRiskyContent =
    /[\u3040-\u30ff\u3400-\u9fff]|https?:\/\/|storage[_-]?key|presigned|prompt|email|birthdate|@/i.test(
      firstLine,
    )
  return hasRiskyContent ? 'redacted_failure' : firstLine
}

async function main() {
  const mode = argValue('--mode', 'contract')
  const result = mode === 'app' ? await runAppSmoke() : assertContract()
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        issue,
        result: 'fail',
        error: safeFailureMessage(error),
        evidence: 'redacted-failure-output',
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
