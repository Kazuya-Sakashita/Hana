const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

function requirePlaywright() {
  try {
    return require('playwright')
  } catch (error) {
    const runtimeNodeModules = process.env.CODEX_RUNTIME_NODE_MODULES
    if (!runtimeNodeModules) throw error
    return require(join(runtimeNodeModules, 'playwright'))
  }
}

const { chromium } = requirePlaywright()

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'
const now = '2026-07-23T10:00:00Z'
const childId = '00000000-0000-4000-8000-000000000055'
const imageId = '00000000-0000-4000-8000-000000000056'
const memoryId = '00000000-0000-4000-8000-000000000057'
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/az6m9kAAAAASUVORK5CYII=',
  'base64',
)

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

function problem(body, status) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify(body),
  }
}

async function installMockRoutes(page, options = {}) {
  let aiConsentAt = options.aiConsented ? now : null

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/synthetic-upload' && method === 'PUT') {
      await delay(100)
      await route.fulfill({ status: 200, body: '' })
      return
    }

    if (!url.pathname.startsWith('/v1/')) {
      await route.continue()
      return
    }

    if (url.pathname === '/v1/me' && method === 'GET') {
      await route.fulfill(
        json({
          id: '00000000-0000-4000-8000-000000000054',
          email: null,
          display_name: 'synthetic-parent',
          ai_consent_at: aiConsentAt,
          created_at: now,
        }),
      )
      return
    }

    if (url.pathname === '/v1/me/ai-consent' && method === 'POST') {
      aiConsentAt = now
      await delay(250)
      await route.fulfill(
        json({
          id: '00000000-0000-4000-8000-000000000054',
          email: null,
          display_name: 'synthetic-parent',
          ai_consent_at: aiConsentAt,
          created_at: now,
        }),
      )
      return
    }

    if (url.pathname === '/v1/children' && method === 'GET') {
      await route.fulfill(
        json({
          data: [
            {
              id: childId,
              name: 'はな',
              birthdate: '2025-05-23',
              avatar_url: null,
              created_at: now,
              updated_at: now,
            },
          ],
        }),
      )
      return
    }

    if (url.pathname === '/v1/uploads/presigned-url' && method === 'POST') {
      await delay(300)
      await route.fulfill(
        json({
          presigned_url: `${baseUrl}/synthetic-upload`,
          storage_key: 'redacted',
          expires_at: '2026-07-23T12:00:00Z',
        }),
      )
      return
    }

    if (url.pathname === '/v1/uploads/confirm' && method === 'POST') {
      await delay(300)
      await route.fulfill(
        json(
          {
            id: imageId,
            memory_id: null,
            content_type: 'image/png',
            width: 1,
            height: 1,
            file_size: syntheticPng.byteLength,
            created_at: now,
          },
          201,
        ),
      )
      return
    }

    if (url.pathname === '/v1/ai/generate' && method === 'POST') {
      if (!aiConsentAt) {
        await route.fulfill(
          problem(
            {
              type: 'https://hana.app/problems/ai-consent-required',
              title: 'AI consent required',
              status: 403,
              detail: 'AI consent required',
              reason: 'ai_consent_required',
              instance: 'req_synthetic',
            },
            403,
          ),
        )
        return
      }
      await delay(1200)
      await route.fulfill(
        json({
          title: 'synthetic-title',
          body: 'synthetic-story-preview',
        }),
      )
      return
    }

    if (url.pathname === '/v1/memories' && method === 'POST') {
      await delay(300)
      await route.fulfill(
        json(
          {
            id: memoryId,
            child_id: childId,
            title: 'synthetic-title',
            body: null,
            recorded_at: '2026-07-23',
            weather: null,
            is_favorite: false,
            ai_generated: true,
            image_ids: [imageId],
            created_at: now,
            updated_at: now,
          },
          201,
        ),
      )
      return
    }

    if (url.pathname === '/v1/memories' && method === 'GET') {
      await route.fulfill(json({ data: [], page: { next_cursor: null } }))
      return
    }

    await route.fulfill(json({ data: null }, 404))
  })
}

async function pickSyntheticPhoto(page, imagePath) {
  const chooserPromise = page.waitForEvent('filechooser')
  await page
    .getByText(/しゃしんを えらぶ|しゃしんを えらびなおす/)
    .last()
    .click()
  const chooser = await chooserPromise
  await chooser.setFiles(imagePath)
}

async function runPath(name, options, steps) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  await installMockRoutes(page, options)
  await page.goto(`${baseUrl}/record`)
  await page.getByText('しゃしんを えらぶ').waitFor()
  const result = await steps(page)
  await browser.close()
  return { name, ...result }
}

async function main() {
  const imagePath = join(tmpdir(), `hana-issue-055-${Date.now()}.png`)
  writeFileSync(imagePath, syntheticPng)

  const core = await runPath('core AI path', { aiConsented: true }, async (page) => {
    const start = performance.now()
    await pickSyntheticPhoto(page, imagePath)
    await page.getByText('AI で 下書きする').click()
    await page.getByTestId('record-story-preview').waitFor()
    await page.getByRole('button', { name: 'このまま 残す' }).click()
    await page.waitForURL('**/album')
    return { elapsed_ms: Math.round(performance.now() - start), result: 'pass' }
  })

  const manual = await runPath(
    'AI skip / manual save path',
    { aiConsented: true },
    async (page) => {
      const start = performance.now()
      await pickSyntheticPhoto(page, imagePath)
      await page.getByText('AI を使わずに 書く').click()
      await page.getByLabel('タイトル').fill('synthetic-title')
      await page.getByRole('button', { name: 'このまま 残す' }).click()
      await page.waitForURL('**/album')
      return { elapsed_ms: Math.round(performance.now() - start), result: 'pass' }
    },
  )

  const firstConsent = await runPath('first consent path', { aiConsented: false }, async (page) => {
    await pickSyntheticPhoto(page, imagePath)
    await page.getByText('AI で 下書きする').click()
    await page.getByText('AI を つかわない').waitFor()
    const start = performance.now()
    await page.getByText('どういして、つくる').click()
    await page.getByTestId('record-story-preview').waitFor()
    return { elapsed_ms: Math.round(performance.now() - start), result: 'pass' }
  })

  const rows = [core, manual, firstConsent]
  const safeRows = rows.map((row) => ({
    path: row.name,
    result: row.result,
    elapsed_ms: row.elapsed_ms,
  }))
  console.log(
    JSON.stringify({ viewport: '390x844', evidence: 'synthetic-only', rows: safeRows }, null, 2),
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
