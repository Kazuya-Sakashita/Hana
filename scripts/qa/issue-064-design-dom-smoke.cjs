const { join } = require('node:path')

const issue = 'ISSUE-064'
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'
const syntheticMemoryId = process.env.HANA_QA_MEMORY_ID ?? '00000000-0000-4000-8000-000000000064'

const targetSurfaces = [
  { id: 'home', path: '/', authRequired: true, authMode: 'server-session' },
  { id: 'record', path: '/record', authRequired: true, authMode: 'client-api-mockable' },
  { id: 'album', path: '/album', authRequired: true, authMode: 'server-session' },
  {
    id: 'memory-detail',
    path: `/memory/${syntheticMemoryId}?saved=1`,
    authRequired: true,
    authMode: 'server-session',
  },
  { id: 'settings', path: '/settings', authRequired: true, authMode: 'client-api-mockable' },
  { id: 'onboarding', path: '/onboarding', authRequired: true, authMode: 'client-api-mockable' },
]

const viewportMatrix = [
  { id: 'compact-short', width: 390, height: 640 },
  { id: 'compact-tall', width: 390, height: 844 },
  { id: 'large-phone', width: 430, height: 932 },
  { id: 'tablet', width: 768, height: 1024 },
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
  'heading-order',
  'tap-targets',
  'focus-order',
  'visible-focus',
  'horizontal-overflow',
  'reduced-motion',
  'pressure-copy',
  'redacted-evidence-output',
]

const routeContracts = {
  home: {
    expectedPathname: '/',
    requiredSelectors: ['#home-primary-action'],
  },
  record: {
    expectedPathname: '/record',
    requiredSelectors: ['[data-testid="record-bottom-sheet"]'],
  },
  album: {
    expectedPathname: '/album',
    requiredSelectors: ['main h1'],
  },
  'memory-detail': {
    expectedPathname: `/memory/${syntheticMemoryId}`,
    requiredSelectors: ['#memory-saved-moment-title', 'article'],
  },
  settings: {
    expectedPathname: '/settings',
    requiredSelectors: ['section[aria-label="Hana の設定"]'],
  },
  onboarding: {
    expectedPathname: '/onboarding',
    requiredSelectors: ['form, [data-testid="onboarding-first-memory-actions"]'],
  },
}

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

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

async function installClientApiMocks(page, surfaceId) {
  const now = '2026-07-24T10:00:00Z'
  const childData =
    surfaceId === 'onboarding'
      ? []
      : [
          {
            id: '00000000-0000-4000-8000-000000000064',
            name: 'はな',
            birthdate: '2025-04-01',
            avatar_url: null,
            created_at: now,
            updated_at: now,
          },
        ]

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/v1/me' && method === 'GET') {
      await route.fulfill(
        json({
          id: '00000000-0000-4000-8000-000000000064',
          email: null,
          display_name: 'synthetic-parent',
          ai_consent_at: now,
          created_at: now,
        }),
      )
      return
    }

    if (url.pathname === '/v1/children' && method === 'GET') {
      await route.fulfill(json({ data: childData }))
      return
    }

    await route.fulfill(json({ data: null }, 404))
  })
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

  if (result.h1Count < 1) {
    throw new Error(`${target.id}: missing h1`)
  }
  if (result.jumps.length > 0) {
    throw new Error(`${target.id}: heading level jumps ${JSON.stringify(result.jumps)}`)
  }
}

async function assertTapTargets(page, target) {
  const failures = await page.$$eval(interactiveSelector, (elements) =>
    elements
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
      .filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
      )
      .map((element, index) => {
        const rect = element.getBoundingClientRect()
        return {
          element_index: index,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          type: element.getAttribute('type'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter((element) => element.width < 44 || element.height < 44),
  )

  if (failures.length > 0) {
    throw new Error(`${target.id}: small interactive targets ${JSON.stringify(failures)}`)
  }
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
      document.documentElement.scrollWidth > window.innerWidth + 1
        ? [
            {
              source: 'document',
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: window.innerWidth,
            },
          ]
        : []

    const elementOverflow = Array.from(document.querySelectorAll('body *'))
      .filter(isVisibleElement)
      .filter((element) => {
        const style = window.getComputedStyle(element)
        return style.overflowX !== 'auto' && style.overflowX !== 'scroll'
      })
      .filter((element) =>
        Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
        ),
      )
      .map((element, index) => ({
        element_index: index,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        scrollWidth: Math.round(element.scrollWidth),
        clientWidth: Math.round(element.clientWidth),
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 1)

    return [...documentOverflow, ...elementOverflow]
  })

  if (overflow.length > 0) {
    throw new Error(`${target.id}: horizontal overflow ${JSON.stringify(overflow)}`)
  }
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
  for (let index = 0; index < 12; index += 1) {
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
    if (!hasVisibleFocus) {
      throw new Error(`${target.id}: focus is not visible ${JSON.stringify(descriptor)}`)
    }
  }

  if (visited.length < 1) {
    throw new Error(`${target.id}: no focusable elements visited`)
  }
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
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          animationName: style.animationName,
          animationDuration: style.animationDuration,
        }
      })
      .filter((item) => item.animationName !== 'none')
      .filter((item) =>
        item.animationDuration.split(',').some((duration) => Number.parseFloat(duration) > 0.05),
      ),
  )

  if (animated.length > 0) {
    throw new Error(`${target.id}: reduced motion still has animations ${JSON.stringify(animated)}`)
  }
}

async function assertPressureAndEvidenceCopy(page, target) {
  const text = await page.locator('body').innerText()
  const forbiddenCopy =
    /今日まだ|記録していません|途切れ|ストリーク|streak|いいね|ランキング|投稿|フォロワー|映え|今すぐ記録しないと/i
  const forbiddenEvidence = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:生年月日|誕生日)\s*[:：]\s*(?:19|20)\d{2}/,
    /(?:山田|佐藤|鈴木|田中|高橋|伊藤|渡辺|中村|小林|加藤)\s*(?:太郎|花子|一郎|美咲)/,
    /やわらかい光|今日も元気|ちいさな手|公園に行きました/,
  ]

  const pressureMatch = forbiddenCopy.exec(text)
  if (pressureMatch) {
    throw new Error(`${target.id}: pressure or feed copy matched forbidden pattern`)
  }
  for (const pattern of forbiddenEvidence) {
    if (pattern.test(text)) {
      throw new Error(`${target.id}: forbidden evidence text ${pattern}`)
    }
  }
}

async function assertLoadedTarget(page, target, response) {
  await page.waitForLoadState('domcontentloaded')
  const contract = routeContracts[target.id]
  const status = response?.status() ?? null
  if (typeof status === 'number' && status >= 400) {
    throw new Error(`${target.id}: route-status failed status=${status}`)
  }

  const currentPath = new URL(page.url()).pathname
  if (target.authRequired && currentPath === '/sign-in') {
    throw new Error(
      `${target.id}: redirected to /sign-in. Run app mode with an authenticated QA session or a synthetic auth fixture.`,
    )
  }
  if (contract && currentPath !== contract.expectedPathname) {
    throw new Error(`${target.id}: final-path failed expected=${contract.expectedPathname}`)
  }
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10_000 })
  for (const selector of contract?.requiredSelectors ?? []) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 })
  }
}

async function assertPage(page, target, response) {
  await assertLoadedTarget(page, target, response)
  await assertHeadingOrder(page, target)
  await assertTapTargets(page, target)
  await assertHorizontalOverflow(page, target)
  await assertVisibleFocus(page, target)
  await assertReducedMotion(page, target)
  await assertPressureAndEvidenceCopy(page, target)
}

function assertContract() {
  const paths = targetSurfaces.map((target) => target.path)
  const requiredPaths = ['/', '/record', '/album', '/settings', '/onboarding']
  for (const path of requiredPaths) {
    if (!paths.includes(path)) throw new Error(`missing target path: ${path}`)
  }
  if (!paths.some((path) => path.startsWith('/memory/'))) {
    throw new Error('missing memory detail target')
  }

  for (const requiredSelector of [
    'summary',
    '[role="button"]',
    '[tabindex]:not([tabindex="-1"])',
  ]) {
    if (!interactiveSelector.includes(requiredSelector)) {
      throw new Error(`interactive selector missing ${requiredSelector}`)
    }
  }

  for (const requiredCheck of [
    'heading-order',
    'tap-targets',
    'focus-order',
    'horizontal-overflow',
    'reduced-motion',
    'redacted-evidence-output',
  ]) {
    if (!checkList.includes(requiredCheck)) throw new Error(`missing check: ${requiredCheck}`)
  }

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    artifact_policy:
      'read-only: no screenshot, accessibility snapshot, or manifest file is written',
    target_surfaces: targetSurfaces.map((target) => ({
      id: target.id,
      path: target.path.replace(syntheticMemoryId, ':memoryId'),
      auth_required: target.authRequired,
      auth_mode: target.authMode,
      required_selectors: routeContracts[target.id]?.requiredSelectors ?? [],
    })),
    viewports: viewportMatrix,
    interactive_selector: interactiveSelector,
    checks: checkList,
  }
}

async function runAppSmoke() {
  const { chromium } = requirePlaywright()
  const browser = await chromium.launch({ headless: true })
  const results = []
  const selectedSurfaceArg = argValue('--surfaces', 'all')
  const selectedSurfaceIds =
    selectedSurfaceArg === 'all'
      ? null
      : new Set(String(selectedSurfaceArg).split(',').filter(Boolean))
  const selectedTargets = selectedSurfaceIds
    ? targetSurfaces.filter((target) => selectedSurfaceIds.has(target.id))
    : targetSurfaces

  try {
    for (const target of selectedTargets) {
      for (const viewport of viewportMatrix) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: 'reduce',
          storageState: process.env.HANA_QA_STORAGE_STATE || undefined,
        })
        const page = await context.newPage()
        await installClientApiMocks(page, target.id)
        const response = await page.goto(new URL(target.path, baseUrl).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await assertPage(page, target, response)
        results.push({
          target: target.id,
          path: target.path.replace(syntheticMemoryId, ':memoryId'),
          viewport: viewport.id,
          result: 'pass',
        })
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  return {
    issue,
    mode: 'app',
    base_url: baseUrl.replace(/:\/\/[^/]+/, '://<redacted-host>'),
    result: 'pass',
    evidence: 'redacted-dom-smoke-output',
    artifact_policy:
      'read-only: no screenshot, accessibility snapshot, or manifest file is written',
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
