import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { E2E_CHILD_ID, E2E_IMAGE_ID, E2E_RETRY_IMAGE_ID } from './support/constants'
import { seedSyntheticAccount } from './support/database'

let createdMemoryPath = ''

test.describe.serial('authenticated synthetic golden path', () => {
  test.beforeAll(async () => {
    await seedSyntheticAccount()
  })
  test('crosses the real cookie and Route Handler boundary, saves, and renders the album', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL('http://127.0.0.1:3100/')
    await expect(page.locator('#home-primary-action')).toBeVisible()

    const status = await page.evaluate(
      async ({ childId, imageId, idempotencyKey }) => {
        const response = await fetch('/v1/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            child_id: childId,
            title: '合成データの記録',
            body: '実ユーザー情報を含まないCI専用の本文です。',
            recorded_at: '2026-07-31',
            image_ids: [imageId],
            ai_generated: false,
          }),
        })
        return response.status
      },
      { childId: E2E_CHILD_ID, imageId: E2E_IMAGE_ID, idempotencyKey: randomUUID() },
    )
    expect(status).toBe(201)

    await page.goto('/album?month=2026-07')
    await expect(page).toHaveURL(/\/album\?month=2026-07$/)
    await expect(page.getByText('合成データの記録', { exact: true })).toBeVisible()
  })

  test('recovers a failed upload and saves through the record UI without AI', async ({ page }) => {
    let uploadAttempts = 0
    let prepareAttempts = 0
    let resolveMemoryHeaders:
      | ((value: { cookieHeaderBytes: number; hasAuthorizationHeader: boolean }) => void)
      | undefined
    const memoryHeaders = new Promise<{
      cookieHeaderBytes: number
      hasAuthorizationHeader: boolean
    }>((resolve) => {
      resolveMemoryHeaders = resolve
    })
    page.on('request', async (request) => {
      if (new URL(request.url()).pathname !== '/v1/memories' || request.method() !== 'POST') return
      const headers = await request.allHeaders()
      resolveMemoryHeaders?.({
        cookieHeaderBytes: Buffer.byteLength(headers.cookie ?? ''),
        hasAuthorizationHeader: 'authorization' in headers,
      })
      resolveMemoryHeaders = undefined
    })
    await page.route('**/v1/me', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-000000000140',
          email: null,
          display_name: 'synthetic-parent',
          ai_consent_at: null,
          created_at: '2026-07-31T00:00:00.000Z',
        }),
      })
    })
    await page.route('**/v1/uploads/presigned-url', async (route) => {
      prepareAttempts += 1
      const suffix = prepareAttempts === 1 ? 'first' : 'second'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presigned_url: `http://127.0.0.1:3100/__synthetic-upload-${suffix}`,
          storage_key: `uploads/synthetic/issue-140-retry-${suffix}.png`,
          expires_at: '2026-08-01T00:00:00.000Z',
        }),
      })
    })
    await page.route('**/__synthetic-upload-*', async (route) => {
      uploadAttempts += 1
      expect(route.request().headers()['content-type']).toBe('image/png')
      await route.fulfill({ status: uploadAttempts === 1 ? 503 : 200, body: '' })
    })
    await page.route('**/v1/uploads/confirm', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(['file_size', 'height', 'storage_key', 'width'])
      expect(body.storage_key).toBe('uploads/synthetic/issue-140-retry-second.png')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: E2E_RETRY_IMAGE_ID,
          memory_id: null,
          content_type: 'image/png',
          width: 2,
          height: 2,
          file_size: 68,
          created_at: '2026-07-31T00:00:00.000Z',
        }),
      })
    })

    await page.goto('/record')
    await page.locator('#memory-photo').setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZf6VfQAAAAASUVORK5CYII=',
        'base64',
      ),
    })

    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button', { name: '同じ写真を もういちど送る' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'しゃしんを 受けとりました' }),
    ).toBeVisible()
    expect(uploadAttempts).toBe(2)
    expect(prepareAttempts).toBe(2)

    await page.getByRole('button', { name: 'AI を使わずに 書く' }).click()
    await page.locator('#memory-title').fill('再送して残した合成記録')
    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/v1/memories' &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'このまま 残す' }).click()
    const [{ cookieHeaderBytes, hasAuthorizationHeader }, memoryResponse] = await Promise.all([
      memoryHeaders,
      saveResponse,
    ])
    expect(memoryResponse.status()).toBe(201)
    expect(cookieHeaderBytes).toBeGreaterThan(3_000)
    expect(cookieHeaderBytes).toBeLessThan(7_500)
    expect(hasAuthorizationHeader).toBe(false)

    await expect(page).toHaveURL(/\/memory\/[0-9a-f-]+\?saved=1$/)
    await expect(page.getByText('再送して残した合成記録', { exact: true })).toBeVisible()
    createdMemoryPath = new URL(page.url()).pathname
  })

  test('stops a stalled AI fixture at the client timeout and offers recovery', async ({ page }) => {
    await page.clock.install()
    await page.route('**/v1/uploads/presigned-url', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presigned_url: 'http://127.0.0.1:3100/__synthetic-ai-upload',
          storage_key: 'uploads/synthetic/issue-140-ai.png',
          expires_at: '2026-08-01T00:00:00.000Z',
        }),
      }),
    )
    await page.route('**/__synthetic-ai-upload', (route) =>
      route.fulfill({ status: 200, body: '' }),
    )
    await page.route('**/v1/uploads/confirm', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: E2E_RETRY_IMAGE_ID,
          memory_id: null,
          content_type: 'image/png',
          width: 2,
          height: 2,
          file_size: 68,
          created_at: '2026-07-31T00:00:00.000Z',
        }),
      }),
    )

    let releaseAiFixture: (() => void) | undefined
    let aiRoute: Parameters<Parameters<typeof page.route>[1]>[0] | undefined
    const aiRequested = new Promise<void>((resolve) => {
      void page.route('**/v1/ai/generate', async (route) => {
        aiRoute = route
        resolve()
        await new Promise<void>((release) => {
          releaseAiFixture = release
        })
      })
    })

    await page.goto('/record')
    await page.locator('#memory-photo').setInputFiles({
      name: 'synthetic-ai.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZf6VfQAAAAASUVORK5CYII=',
        'base64',
      ),
    })
    await page.getByRole('button', { name: 'AI で 下書きする' }).click()
    await aiRequested
    await page.clock.fastForward(30_000)

    await expect(
      page.getByRole('alert').filter({ hasText: 'AIの待機を ここで終えました' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'もういちど AI で 下書きする' })).toBeVisible()
    await aiRoute?.abort('timedout').catch(() => undefined)
    releaseAiFixture?.()
  })

  test('keeps the edit and exposes the refresh action on a real 409 conflict', async ({ page }) => {
    expect(createdMemoryPath).toMatch(/^\/memory\/[0-9a-f-]+$/)
    await page.goto(`${createdMemoryPath}/edit`)
    const apiPath = `/v1${createdMemoryPath.replace('/memory/', '/memories/')}`
    const initial = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return response.json() as Promise<{ updated_at: string }>
    }, apiPath)

    const competingStatus = await page.evaluate(
      async ({ path, updatedAt }) => {
        const response = await fetch(path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_updated_at: updatedAt,
            title: '別画面の合成更新',
          }),
        })
        return response.status
      },
      { path: apiPath, updatedAt: initial.updated_at },
    )
    expect(competingStatus).toBe(200)

    await page.locator('#memory-edit-title').fill('入力を維持する合成編集')
    await page.getByRole('button', { name: 'この内容で なおす' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: '別の画面で、この記録が更新されました' }),
    ).toBeVisible()
    await expect(page.locator('#memory-edit-title')).toHaveValue('入力を維持する合成編集')
    await expect(page.getByRole('button', { name: '最新の内容を確認する' })).toBeVisible()
  })

  test('signs out through the real server route and clears the protected session', async ({
    page,
  }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'サインアウト' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)

    await page.goto('/album')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Falbum$/)
  })
})
