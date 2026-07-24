#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_CDP_URL = 'http://127.0.0.1:9222'
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_INITIAL_WAIT_MS = 2500
const DEFAULT_SCROLL_WAIT_MS = 1800
const LAZY_NATIVE_PREFETCH_THRESHOLDS_PX = {
  '4g': 1250,
  '3g': 2500,
  '2g': 2500,
  'slow-2g': 2500,
  unknown: 2500,
}
const LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX = 250

const CHECK_STATUS = new Set(['pass', 'fail', 'skipped'])

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
    } else if (arg === '--cdp-url' && next) {
      out.cdpUrl = next
      i++
    } else if (arg === '--memory-path' && next) {
      out.memoryPath = next
      i++
    } else if (arg === '--timeout-ms' && next) {
      out.timeoutMs = Number(next)
      i++
    } else if (arg === '--initial-wait-ms' && next) {
      out.initialWaitMs = Number(next)
      i++
    } else if (arg === '--scroll-wait-ms' && next) {
      out.scrollWaitMs = Number(next)
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
  const cdpUrl = normalizeBaseUrl(parsed.cdpUrl ?? env.HANA_QA_CDP_URL ?? DEFAULT_CDP_URL)
  const memoryPath = normalizeMemoryPath(parsed.memoryPath ?? env.HANA_QA_MEMORY_PATH ?? '')

  return {
    baseUrl,
    cdpUrl,
    memoryPath,
    timeoutMs: readPositiveNumber(parsed.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    initialWaitMs: readPositiveNumber(
      parsed.initialWaitMs,
      DEFAULT_INITIAL_WAIT_MS,
      'initialWaitMs',
    ),
    scrollWaitMs: readPositiveNumber(parsed.scrollWaitMs, DEFAULT_SCROLL_WAIT_MS, 'scrollWaitMs'),
    selfTest: parsed.selfTest === true,
    help: parsed.help === true,
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('base and CDP URLs must not include credentials, query, or fragment')
  }
  return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href
}

function normalizeMemoryPath(value) {
  if (!value) return ''
  if (!value.startsWith('/memory/')) {
    throw new Error('memory path must start with /memory/')
  }
  const parsed = new URL(value, 'http://local.invalid')
  if (parsed.search || parsed.hash) {
    throw new Error('memory path must not include query or fragment')
  }
  return parsed.pathname
}

function readPositiveNumber(value, fallback, label) {
  if (value === undefined || Number.isNaN(value)) return fallback
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
  return value
}

export function classifyImageUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return {
      variant: 'other',
      isSigned: false,
      isSupabaseStorage: false,
      extension: 'unknown',
    }
  }

  const pathname = decodeURIComponent(url.pathname).toLowerCase()
  const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1] ?? 'unknown'
  const isSupabaseStorage =
    url.hostname.endsWith('.supabase.co') && pathname.includes('/storage/v1/object/')
  const isSigned = pathname.includes('/storage/v1/object/sign/') || url.searchParams.has('token')

  let variant = 'other'
  if (pathname.endsWith('_thumb.webp')) {
    variant = 'thumbnail'
  } else if (pathname.endsWith('_preview.webp')) {
    variant = 'preview'
  } else if (pathname.endsWith('.webp')) {
    variant = 'webp'
  }

  return {
    variant,
    isSigned,
    isSupabaseStorage,
    extension,
  }
}

export function summarizeChecks({
  albumPath,
  albumImageElementCount,
  albumLazyEvidence,
  requests,
  memoryChecked,
}) {
  const albumRequests = requests.filter((request) => request.page === 'album')
  const memoryRequests = requests.filter((request) => request.page === 'memory')

  const albumSignedThumbnailCount = albumRequests.filter(
    (request) => request.classification.variant === 'thumbnail' && request.classification.isSigned,
  ).length
  const albumUnsignedThumbnailCount = albumRequests.filter(
    (request) => request.classification.variant === 'thumbnail' && !request.classification.isSigned,
  ).length
  const memorySignedPreviewCount = memoryRequests.filter(
    (request) => request.classification.variant === 'preview' && request.classification.isSigned,
  ).length
  const memoryUnsignedPreviewCount = memoryRequests.filter(
    (request) => request.classification.variant === 'preview' && !request.classification.isSigned,
  ).length

  const lazyStatus = classifyLazyStatus(albumLazyEvidence)
  const thumbnailStatus =
    albumSignedThumbnailCount > 0 && albumUnsignedThumbnailCount === 0 ? 'pass' : 'fail'
  const previewStatus = !memoryChecked
    ? 'skipped'
    : memorySignedPreviewCount > 0 && memoryUnsignedPreviewCount === 0
      ? 'pass'
      : 'fail'
  const nativePrefetchThresholdPx =
    albumLazyEvidence.nativePrefetchThresholdPx ?? readNativePrefetchThresholdPx('unknown')
  const farOffscreenSafetyMarginPx =
    albumLazyEvidence.farOffscreenSafetyMarginPx ?? LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX
  const minDistanceFromViewportPx = formatNullableNumber(
    albumLazyEvidence.minDistanceFromViewportPx,
  )

  return [
    makeCheck(
      'album_authenticated',
      albumPath === '/album' ? 'pass' : 'fail',
      albumPath === '/album' ? '/album rendered' : `unexpected path: ${albumPath}`,
    ),
    makeCheck(
      'album_thumbnail_variant',
      thumbnailStatus,
      `${albumSignedThumbnailCount} signed thumbnail WebP image request(s) observed; unsigned thumbnail=${albumUnsignedThumbnailCount}`,
    ),
    makeCheck(
      'album_lazy_after_scroll',
      lazyStatus,
      lazyStatus === 'skipped'
        ? `not enough far-offscreen image candidates: dom=${albumImageElementCount}, farOffscreen=${albumLazyEvidence.offscreenStorageImageCount}, minDistanceFromViewportPx=${minDistanceFromViewportPx}, nativePrefetchThresholdPx=${nativePrefetchThresholdPx}, safetyMarginPx=${farOffscreenSafetyMarginPx}`
        : `farOffscreen=${albumLazyEvidence.offscreenStorageImageCount}, initial=${albumLazyEvidence.offscreenInitialRequestedCount}, after scroll=${albumLazyEvidence.offscreenScrollRequestedCount}, minDistanceFromViewportPx=${minDistanceFromViewportPx}, nativePrefetchThresholdPx=${nativePrefetchThresholdPx}, safetyMarginPx=${farOffscreenSafetyMarginPx}`,
    ),
    makeCheck(
      'memory_preview_variant',
      previewStatus,
      memoryChecked
        ? `${memorySignedPreviewCount} signed preview WebP image request(s) observed; unsigned preview=${memoryUnsignedPreviewCount}`
        : 'HANA_QA_MEMORY_PATH was not provided',
    ),
  ]
}

function formatNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'n/a'
}

function readNativePrefetchThresholdPx(effectiveConnectionType) {
  return (
    LAZY_NATIVE_PREFETCH_THRESHOLDS_PX[effectiveConnectionType] ??
    LAZY_NATIVE_PREFETCH_THRESHOLDS_PX.unknown
  )
}

export function classifyLazyStatus(evidence) {
  if (evidence.offscreenStorageImageCount === 0) return 'skipped'
  if (evidence.offscreenInitialRequestedCount > 0) return 'fail'
  return evidence.offscreenScrollRequestedCount > 0 ? 'pass' : 'fail'
}

function makeCheck(name, status, evidence) {
  if (!CHECK_STATUS.has(status)) throw new Error(`invalid check status: ${status}`)
  return { name, status, evidence }
}

export function sanitizeRequest(record) {
  const classification = classifyImageUrl(record.url)
  return {
    page: record.page,
    phase: record.phase,
    status: record.status ?? null,
    mimeType: record.mimeType ?? null,
    encodedDataLength: record.encodedDataLength ?? null,
    classification,
  }
}

export async function runImageNetworkQa(config) {
  const target = await openCdpTarget(config.cdpUrl, `${config.baseUrl}/album`)
  let session = null
  const rawRequests = new Map()
  let currentPage = 'album'
  let currentPhase = 'album-initial'
  let albumScrollStartedAtWallTimeSec = null
  let albumScrollBeforeY = null
  let albumScrollAfterY = null

  try {
    session = await connectCdp(target.webSocketDebuggerUrl, config.timeoutMs)

    session.on('Network.requestWillBeSent', (params) => {
      if (params.type !== 'Image') return
      rawRequests.set(params.requestId, {
        url: params.request.url,
        page: currentPage,
        phase: currentPhase,
        requestedAtWallTimeSec: params.wallTime ?? null,
      })
    })

    session.on('Network.responseReceived', (params) => {
      if (params.type !== 'Image') return
      const current = rawRequests.get(params.requestId)
      if (!current) {
        rawRequests.set(params.requestId, {
          url: params.response.url,
          page: currentPage,
          phase: currentPhase,
          requestedAtWallTimeSec: null,
        })
      }
      const next = rawRequests.get(params.requestId)
      next.status = params.response.status
      next.mimeType = params.response.mimeType
    })

    session.on('Network.loadingFinished', (params) => {
      const current = rawRequests.get(params.requestId)
      if (current) current.encodedDataLength = params.encodedDataLength
    })

    await session.send('Page.enable')
    await session.send('Runtime.enable')
    await session.send('Network.enable')
    await session.send('Network.setCacheDisabled', { cacheDisabled: true })
    await session.send('Network.clearBrowserCache')

    await navigateAndWait(session, `${config.baseUrl}/album`, config)
    const albumPath = await evaluateString(session, 'location.pathname')
    const albumImageElementCount = await evaluateNumber(
      session,
      'document.querySelectorAll("img").length',
    )
    const albumEffectiveConnectionType = await evaluateString(
      session,
      'navigator.connection?.effectiveType || "unknown"',
    )
    const albumInitialDomSnapshot = await collectImageDomSnapshot(session)

    if (albumPath === '/album') {
      albumScrollBeforeY = await evaluateNumber(session, 'window.scrollY')
      albumScrollStartedAtWallTimeSec = Date.now() / 1000
      currentPhase = 'album-scroll'
      await session.send('Runtime.evaluate', {
        expression: 'window.scrollTo(0, document.body.scrollHeight)',
        awaitPromise: false,
      })
      await delay(config.scrollWaitMs)
      albumScrollAfterY = await evaluateNumber(session, 'window.scrollY')
    }

    let memoryChecked = false
    if (config.memoryPath) {
      memoryChecked = true
      currentPage = 'memory'
      currentPhase = 'memory-initial'
      await navigateAndWait(session, `${config.baseUrl}${config.memoryPath}`, config)
    }

    const requests = [...rawRequests.values()]
      .map(sanitizeRequest)
      .filter((request) => request.classification.isSupabaseStorage)
    const albumLazyEvidence = analyzeAlbumLazyEvidence(
      albumInitialDomSnapshot,
      [...rawRequests.values()].filter((request) => request.page === 'album'),
      {
        effectiveConnectionType: albumEffectiveConnectionType,
        scrollBeforeY: albumScrollBeforeY,
        scrollAfterY: albumScrollAfterY,
        scrollStartedAtWallTimeSec: albumScrollStartedAtWallTimeSec,
      },
    )
    const checks = summarizeChecks({
      albumPath,
      albumImageElementCount,
      albumLazyEvidence,
      requests,
      memoryChecked,
    })

    return {
      target: {
        baseOrigin: new URL(config.baseUrl).origin,
        cdpOrigin: new URL(config.cdpUrl).origin,
      },
      memoryChecked,
      privacy:
        'Raw URLs are redacted. signed URLs, storage keys, tokens, titles, body text, and child names are not printed.',
      counts: {
        redactedImageRequests: requests.length,
        albumImageElements: albumImageElementCount,
      },
      lazyLoad: {
        farOffscreenCount: albumLazyEvidence.offscreenStorageImageCount,
        initialFarOffscreenRequests: albumLazyEvidence.offscreenInitialRequestedCount,
        scrollFarOffscreenRequests: albumLazyEvidence.offscreenScrollRequestedCount,
        minDistanceFromViewportPx: albumLazyEvidence.minDistanceFromViewportPx,
        maxDistanceFromViewportPx: albumLazyEvidence.maxDistanceFromViewportPx,
        nativePrefetchThresholdPx: albumLazyEvidence.nativePrefetchThresholdPx,
        safetyMarginPx: albumLazyEvidence.farOffscreenSafetyMarginPx,
        farOffscreenMinDistancePx: albumLazyEvidence.farOffscreenMinDistancePx,
        effectiveConnectionType: albumLazyEvidence.effectiveConnectionType,
        scrollBeforeY: albumLazyEvidence.scrollBeforeY,
        scrollAfterY: albumLazyEvidence.scrollAfterY,
        requestTimingCutoff: albumLazyEvidence.requestTimingCutoff,
      },
      checks,
    }
  } finally {
    if (session) session.close()
    await closeCdpTarget(config.cdpUrl, target.id)
  }
}

async function openCdpTarget(cdpUrl, targetUrl) {
  const endpoint = `${cdpUrl}/json/new?${encodeURIComponent(targetUrl)}`
  const response = await fetch(endpoint, { method: 'PUT' })
  if (!response.ok) {
    throw new Error(`failed to open CDP target: ${response.status} ${response.statusText}`)
  }
  const target = await response.json()
  if (!target.webSocketDebuggerUrl || !target.id) {
    throw new Error('CDP target did not return a webSocketDebuggerUrl')
  }
  return target
}

async function closeCdpTarget(cdpUrl, targetId) {
  try {
    await fetch(`${cdpUrl}/json/close/${targetId}`)
  } catch {
    // Best-effort cleanup only.
  }
}

async function connectCdp(webSocketDebuggerUrl, timeoutMs) {
  if (typeof WebSocket !== 'function') {
    throw new Error(
      'global WebSocket is not available; run with a Node.js version that includes it',
    )
  }

  const ws = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map()
  const handlers = new Map()
  let nextId = 0

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out opening CDP WebSocket')), timeoutMs)
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer)
        reject(new Error('failed to open CDP WebSocket'))
      },
      { once: true },
    )
  })

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (typeof message.id === 'number') {
      const callbacks = pending.get(message.id)
      if (!callbacks) return
      pending.delete(message.id)
      if (message.error) {
        callbacks.reject(new Error(message.error.message ?? JSON.stringify(message.error)))
      } else {
        callbacks.resolve(message.result)
      }
      return
    }

    if (message.method) {
      for (const handler of handlers.get(message.method) ?? []) {
        handler(message.params)
      }
    }
  })

  return {
    send(method, params = {}) {
      const id = ++nextId
      const payload = JSON.stringify({ id, method, params })
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`CDP command timed out: ${method}`))
        }, timeoutMs)
        pending.set(id, {
          resolve(value) {
            clearTimeout(timer)
            resolve(value)
          },
          reject(error) {
            clearTimeout(timer)
            reject(error)
          },
        })
        ws.send(payload)
      })
    },
    on(method, handler) {
      const list = handlers.get(method) ?? []
      list.push(handler)
      handlers.set(method, list)
    },
    close() {
      ws.close()
    },
  }
}

async function navigateAndWait(session, url, config) {
  const loaded = waitForEvent(session, 'Page.loadEventFired', config.timeoutMs).catch(() => null)
  const result = await session.send('Page.navigate', { url })
  if (result?.errorText) {
    throw new Error(`navigation failed: ${result.errorText}`)
  }
  const loadResult = await loaded
  if (loadResult === null) {
    throw new Error('navigation timed out before Page.loadEventFired')
  }
  await delay(config.initialWaitMs)
}

function waitForEvent(session, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeoutMs)
    session.on(method, (params) => {
      clearTimeout(timer)
      resolve(params)
    })
  })
}

async function evaluateString(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  })
  return String(result.result?.value ?? '')
}

async function evaluateNumber(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  })
  return Number(result.result?.value ?? 0)
}

async function collectImageDomSnapshot(session) {
  const result = await session.send('Runtime.evaluate', {
    expression: `(() => Array.from(document.querySelectorAll('img')).map((img) => {
      const rect = img.getBoundingClientRect()
      return {
        src: img.currentSrc || img.src || '',
        loading: img.loading || '',
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        viewportHeight: window.innerHeight
      }
    }))()`,
    returnByValue: true,
  })
  return Array.isArray(result.result?.value) ? result.result.value : []
}

export function analyzeAlbumLazyEvidence(domSnapshot, rawAlbumRequests, options = {}) {
  const effectiveConnectionType = options.effectiveConnectionType || 'unknown'
  const nativePrefetchThresholdPx = readNativePrefetchThresholdPx(effectiveConnectionType)
  const farOffscreenMinDistancePx = nativePrefetchThresholdPx + LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX
  const hasWallTimeCutoff =
    typeof options.scrollStartedAtWallTimeSec === 'number' &&
    Number.isFinite(options.scrollStartedAtWallTimeSec)
  const isInitialRequest = (request) =>
    hasWallTimeCutoff && typeof request.requestedAtWallTimeSec === 'number'
      ? request.requestedAtWallTimeSec < options.scrollStartedAtWallTimeSec
      : request.phase === 'album-initial'
  const isScrollRequest = (request) =>
    hasWallTimeCutoff && typeof request.requestedAtWallTimeSec === 'number'
      ? request.requestedAtWallTimeSec >= options.scrollStartedAtWallTimeSec
      : request.phase === 'album-scroll'
  const initialUrls = new Set(
    rawAlbumRequests.filter((request) => isInitialRequest(request)).map((request) => request.url),
  )
  const scrollUrls = new Set(
    rawAlbumRequests.filter((request) => isScrollRequest(request)).map((request) => request.url),
  )

  const offscreenStorageImages = domSnapshot
    .map((item) => ({
      ...item,
      distanceFromViewportPx: Math.round(item.top - item.viewportHeight),
    }))
    .filter((item) => {
      const classification = classifyImageUrl(item.src)
      return (
        classification.isSupabaseStorage &&
        classification.isSigned &&
        item.distanceFromViewportPx > farOffscreenMinDistancePx
      )
    })
  const distances = offscreenStorageImages.map((item) => item.distanceFromViewportPx)

  return {
    offscreenStorageImageCount: offscreenStorageImages.length,
    effectiveConnectionType,
    nativePrefetchThresholdPx,
    farOffscreenSafetyMarginPx: LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX,
    farOffscreenMinDistancePx,
    minDistanceFromViewportPx: distances.length > 0 ? Math.min(...distances) : null,
    maxDistanceFromViewportPx: distances.length > 0 ? Math.max(...distances) : null,
    scrollBeforeY: roundNullable(options.scrollBeforeY),
    scrollAfterY: roundNullable(options.scrollAfterY),
    requestTimingCutoff: hasWallTimeCutoff ? 'requestWillBeSent.wallTime' : 'phase',
    offscreenInitialRequestedCount: offscreenStorageImages.filter((item) =>
      initialUrls.has(item.src),
    ).length,
    offscreenScrollRequestedCount: offscreenStorageImages.filter((item) => scrollUrls.has(item.src))
      .length,
  }
}

function roundNullable(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function runSelfTest() {
  const cases = [
    {
      url: syntheticSignedStorageImageUrl('photo_thumb.webp'),
      variant: 'thumbnail',
      isSigned: true,
      isSupabaseStorage: true,
    },
    {
      url: syntheticSignedStorageImageUrl('photo_preview.webp'),
      variant: 'preview',
      isSigned: true,
      isSupabaseStorage: true,
    },
    {
      url: 'http://localhost:3000/favicon.svg',
      variant: 'other',
      isSigned: false,
      isSupabaseStorage: false,
    },
  ]

  for (const item of cases) {
    const actual = classifyImageUrl(item.url)
    if (
      actual.variant !== item.variant ||
      actual.isSigned !== item.isSigned ||
      actual.isSupabaseStorage !== item.isSupabaseStorage
    ) {
      throw new Error(`self-test failed for variant=${item.variant}`)
    }
  }

  const checks = summarizeChecks({
    albumPath: '/album',
    albumImageElementCount: 10,
    albumLazyEvidence: {
      offscreenStorageImageCount: 8,
      nativePrefetchThresholdPx: readNativePrefetchThresholdPx('4g'),
      farOffscreenSafetyMarginPx: LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX,
      offscreenInitialRequestedCount: 0,
      offscreenScrollRequestedCount: 1,
    },
    memoryChecked: true,
    requests: [
      {
        page: 'album',
        phase: 'album-initial',
        classification: { variant: 'thumbnail', isSupabaseStorage: true, isSigned: true },
      },
      {
        page: 'album',
        phase: 'album-scroll',
        classification: { variant: 'thumbnail', isSupabaseStorage: true, isSigned: true },
      },
      {
        page: 'memory',
        phase: 'memory-initial',
        classification: { variant: 'preview', isSupabaseStorage: true, isSigned: true },
      },
    ],
  })

  if (checks.some((check) => check.status !== 'pass')) {
    throw new Error('self-test failed: expected all checks to pass')
  }

  const unsignedChecks = summarizeChecks({
    albumPath: '/album',
    albumImageElementCount: 10,
    albumLazyEvidence: {
      offscreenStorageImageCount: 1,
      nativePrefetchThresholdPx: readNativePrefetchThresholdPx('4g'),
      farOffscreenSafetyMarginPx: LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX,
      offscreenInitialRequestedCount: 0,
      offscreenScrollRequestedCount: 1,
    },
    memoryChecked: true,
    requests: [
      {
        page: 'album',
        phase: 'album-initial',
        classification: { variant: 'thumbnail', isSupabaseStorage: true, isSigned: false },
      },
      {
        page: 'memory',
        phase: 'memory-initial',
        classification: { variant: 'preview', isSupabaseStorage: true, isSigned: false },
      },
    ],
  })

  if (
    unsignedChecks.find((check) => check.name === 'album_thumbnail_variant')?.status !== 'fail' ||
    unsignedChecks.find((check) => check.name === 'memory_preview_variant')?.status !== 'fail'
  ) {
    throw new Error('self-test failed: unsigned storage URLs must fail')
  }

  const lazyFailStatus = classifyLazyStatus({
    offscreenStorageImageCount: 1,
    nativePrefetchThresholdPx: readNativePrefetchThresholdPx('4g'),
    farOffscreenSafetyMarginPx: LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX,
    offscreenInitialRequestedCount: 1,
    offscreenScrollRequestedCount: 1,
  })
  if (lazyFailStatus !== 'fail') {
    throw new Error('self-test failed: initial offscreen request must fail lazy check')
  }

  const viewportHeight = 900
  const farOffscreenMinDistancePx =
    readNativePrefetchThresholdPx('4g') + LAZY_FAR_OFFSCREEN_SAFETY_MARGIN_PX
  const nearOffscreenUrl = syntheticSignedStorageImageUrl('near_thumb.webp')
  const farOffscreenUrl = syntheticSignedStorageImageUrl('far_thumb.webp')
  const lazyEvidence = analyzeAlbumLazyEvidence(
    [
      {
        src: nearOffscreenUrl,
        top: viewportHeight + farOffscreenMinDistancePx,
        viewportHeight,
      },
      {
        src: farOffscreenUrl,
        top: viewportHeight + farOffscreenMinDistancePx + 1,
        viewportHeight,
      },
    ],
    [
      {
        phase: 'album-initial',
        url: nearOffscreenUrl,
      },
      {
        phase: 'album-scroll',
        url: farOffscreenUrl,
      },
    ],
    { effectiveConnectionType: '4g' },
  )
  if (
    lazyEvidence.offscreenStorageImageCount !== 1 ||
    lazyEvidence.offscreenInitialRequestedCount !== 0 ||
    lazyEvidence.offscreenScrollRequestedCount !== 1
  ) {
    throw new Error('self-test failed: native lazy-load prefetch margin was not respected')
  }

  const farInitialEvidence = analyzeAlbumLazyEvidence(
    [
      {
        src: farOffscreenUrl,
        top: viewportHeight + farOffscreenMinDistancePx + 1,
        viewportHeight,
      },
    ],
    [
      {
        phase: 'album-initial',
        url: farOffscreenUrl,
      },
    ],
    { effectiveConnectionType: '4g' },
  )
  if (classifyLazyStatus(farInitialEvidence) !== 'fail') {
    throw new Error('self-test failed: far-offscreen initial request must fail lazy check')
  }

  const leakTokenSentinel = ['secret', 'token'].join('-')
  const leakFileSentinel = ['private', 'thumb.webp'].join('_')
  const sanitized = JSON.stringify(
    sanitizeRequest({
      page: 'album',
      phase: 'album-initial',
      status: 200,
      mimeType: 'image/webp',
      encodedDataLength: 10,
      url: syntheticSignedStorageImageUrl(leakFileSentinel, leakTokenSentinel),
    }),
  )
  if (sanitized.includes(leakTokenSentinel) || sanitized.includes(leakFileSentinel)) {
    throw new Error('self-test failed: sanitized request leaked URL detail')
  }
}

function syntheticSignedStorageImageUrl(fileName, token = 'synthetic-token') {
  const url = new URL(
    [
      'https://synthetic.supabase.co',
      '/storage/v1/object/sign/images/uploads/synthetic/202607/',
      fileName,
    ].join(''),
  )
  url.searchParams.set('token', token)
  return url.href
}

function printHelp() {
  console.log(`Usage: node scripts/qa/issue-028-image-network-check.mjs [options]

Options:
  --base-url <url>          App URL (default: HANA_QA_BASE_URL or ${DEFAULT_BASE_URL})
  --cdp-url <url>           Chrome DevTools URL (default: HANA_QA_CDP_URL or ${DEFAULT_CDP_URL})
  --memory-path <path>      Memory detail path, e.g. /memory/<id> (default: HANA_QA_MEMORY_PATH)
  --timeout-ms <ms>         CDP command timeout (default: ${DEFAULT_TIMEOUT_MS})
  --initial-wait-ms <ms>    Wait after navigation (default: ${DEFAULT_INITIAL_WAIT_MS})
  --scroll-wait-ms <ms>     Wait after album scroll (default: ${DEFAULT_SCROLL_WAIT_MS})
  --self-test               Run pure helper self-test without opening Chrome
  --help                    Show this message
`)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const config = readConfig(process.argv.slice(2))
    if (config.help) {
      printHelp()
      process.exit(0)
    }
    if (config.selfTest) {
      runSelfTest()
      console.log('issue-028-image-network-check self-test OK')
      process.exit(0)
    }

    const report = await runImageNetworkQa(config)
    console.log(JSON.stringify(report, null, 2))
    const failed = report.checks.some((check) => check.status === 'fail')
    process.exit(failed ? 1 : 0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
