import { expect, test } from '@playwright/test'
import { E2E_CHILD_ID, E2E_FIXTURE_CONTROL_TOKEN } from './support/constants'
import {
  cleanupCrossActorTelemetryNoise,
  readSyntheticTelemetryFlow,
  seedCrossActorTelemetryNoise,
  seedSyntheticAccount,
} from './support/database'
import type { components } from '@/lib/api/generated/schema'

type UploadConfirmRequest = components['schemas']['UploadConfirmRequest']
type AiGenerateRequest = components['schemas']['AiGenerateRequest']
type Memory = components['schemas']['Memory']
type ProductEventReport = components['schemas']['ProductEventReport']

const SYNTHETIC_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZf6VfQAAAAASUVORK5CYII=',
  'base64',
)

let createdMemoryPath = ''

test.describe.serial('authenticated synthetic golden path', () => {
  test.beforeAll(async () => {
    await seedSyntheticAccount()
  })
  test('uploads through real routes, saves through the record UI, and renders the album', async ({
    page,
    request,
  }) => {
    const metricRequests: ProductEventReport[] = []
    const metricResponseStatuses: number[] = []
    let memoryIdempotencyKey = ''
    let resolveSignedUploadUrl: ((value: string) => void) | undefined
    const signedUploadUrl = new Promise<string>((resolve) => {
      resolveSignedUploadUrl = resolve
    })
    page.on('request', (browserRequest) => {
      const pathname = new URL(browserRequest.url()).pathname
      if (pathname === '/v1/metrics/events' && browserRequest.method() === 'POST') {
        metricRequests.push(browserRequest.postDataJSON() as ProductEventReport)
      }
      if (pathname === '/v1/memories' && browserRequest.method() === 'POST') {
        memoryIdempotencyKey = browserRequest.headers()['idempotency-key'] ?? ''
      }
      if (
        pathname.startsWith('/storage/v1/object/upload/sign/images/') &&
        browserRequest.method() === 'PUT'
      ) {
        resolveSignedUploadUrl?.(browserRequest.url())
        resolveSignedUploadUrl = undefined
      }
    })
    page.on('response', (response) => {
      if (
        new URL(response.url()).pathname === '/v1/metrics/events' &&
        response.request().method() === 'POST'
      ) {
        metricResponseStatuses.push(response.status())
      }
    })
    await page.goto('/record')
    await page.locator('#memory-photo').setInputFiles({
      name: 'synthetic-success.png',
      mimeType: 'image/png',
      buffer: SYNTHETIC_PNG,
    })
    await expect(page.getByRole('status').filter({ hasText: '追加できました' })).toBeVisible()
    expect(
      (
        await request.put(await signedUploadUrl, {
          data: SYNTHETIC_PNG,
          headers: { 'content-type': 'image/png' },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.get(
          'http://127.0.0.1:54321/storage/v1/object/sign/images/synthetic.png?token=invalid',
        )
      ).status(),
    ).toBe(401)

    await page.getByRole('button', { name: 'AI を使わずに 書く' }).click()
    await page.locator('#memory-title').fill('画面から残した合成記録')
    const recordedMonth = (await page.locator('#memory-date').inputValue()).slice(0, 7)
    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/v1/memories' &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'このまま 残す' }).click()
    expect((await saveResponse).status()).toBe(201)

    await expect(page).toHaveURL(/\/memory\/[0-9a-f-]+\?saved=1$/)
    createdMemoryPath = new URL(page.url()).pathname
    await page.goto(`/album?month=${recordedMonth}`)
    await expect(page).toHaveURL(new RegExp(`/album\\?month=${recordedMonth}$`))
    await expect(page.getByText('画面から残した合成記録', { exact: true })).toBeVisible()
    expect(memoryIdempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    await seedCrossActorTelemetryNoise(memoryIdempotencyKey)
    try {
      await expect
        .poll(async () => {
          const flow = await readSyntheticTelemetryFlow(memoryIdempotencyKey)
          return {
            memoryIdempotencyKey: flow.memoryIdempotencyKey,
            eventNames: flow.events.map((event) => event.eventName).sort(),
            flowIds: [...new Set(flow.events.map((event) => event.flowId))],
          }
        })
        .toEqual({
          memoryIdempotencyKey,
          eventNames: ['memory_saved', 'photo_selected', 'record_started'],
          flowIds: [memoryIdempotencyKey],
        })
    } finally {
      await cleanupCrossActorTelemetryNoise(memoryIdempotencyKey)
    }
    expect(
      metricRequests
        .filter((event) => event.flow_id === memoryIdempotencyKey)
        .map((event) => event.event_name)
        .sort(),
    ).toEqual(['memory_saved', 'photo_selected', 'record_started'])
    expect(metricResponseStatuses.length).toBeGreaterThanOrEqual(3)
    expect(metricResponseStatuses.every((status) => status === 204)).toBe(true)
  })

  test('recovers a failed upload and saves through the record UI without AI', async ({
    page,
    request,
  }) => {
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
    let resolveConfirmRequest: ((value: UploadConfirmRequest) => void) | undefined
    const confirmRequest = new Promise<UploadConfirmRequest>((resolve) => {
      resolveConfirmRequest = resolve
    })
    page.on('request', async (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname === '/v1/uploads/presigned-url' && request.method() === 'POST') {
        prepareAttempts += 1
      }
      if (
        pathname.startsWith('/storage/v1/object/upload/sign/images/') &&
        request.method() === 'PUT'
      ) {
        uploadAttempts += 1
        expect(request.headers()['content-type']).toBe('image/png')
      }
      if (pathname === '/v1/uploads/confirm' && request.method() === 'POST') {
        resolveConfirmRequest?.(request.postDataJSON() as UploadConfirmRequest)
        resolveConfirmRequest = undefined
      }
      if (pathname !== '/v1/memories' || request.method() !== 'POST') return
      const headers = await request.allHeaders()
      resolveMemoryHeaders?.({
        cookieHeaderBytes: Buffer.byteLength(headers.cookie ?? ''),
        hasAuthorizationHeader: 'authorization' in headers,
      })
      resolveMemoryHeaders = undefined
    })
    const controlUrl = 'http://127.0.0.1:54321/__fixture__/fail-next-upload'
    expect((await request.post(controlUrl)).status()).toBe(401)
    expect(
      (
        await request.post(controlUrl, {
          headers: { 'x-fixture-control': E2E_FIXTURE_CONTROL_TOKEN },
        })
      ).ok(),
    ).toBe(true)

    await page.goto('/record')
    await page.locator('#memory-photo').setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: SYNTHETIC_PNG,
    })

    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button', { name: '同じ写真を もういちど送る' }).click()
    await expect(page.getByRole('status').filter({ hasText: '追加できました' })).toBeVisible()
    expect(uploadAttempts).toBe(2)
    expect(prepareAttempts).toBe(2)
    const confirmed = await confirmRequest
    expect(Object.keys(confirmed).sort()).toEqual(['file_size', 'height', 'storage_key', 'width'])
    expect(confirmed.storage_key).toMatch(/^uploads\/[0-9a-f]{16}\/\d{6}\/[0-9a-f-]{36}\.png$/)

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
    let releaseAiFixture: (() => void) | undefined
    let aiRoute: Parameters<Parameters<typeof page.route>[1]>[0] | undefined
    const aiRequested = new Promise<void>((resolve) => {
      void page.route('**/v1/ai/generate', async (route) => {
        expect(route.request().method()).toBe('POST')
        const body = route.request().postDataJSON() as AiGenerateRequest
        expect(Object.keys(body).sort()).toEqual([
          'child_id',
          'image_ids',
          'parent_note',
          'recorded_at',
          'weather',
        ])
        expect(body.child_id).toBe(E2E_CHILD_ID)
        expect(body.image_ids).toHaveLength(1)
        expect(body.image_ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
        expect(body.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(body.weather).toBeNull()
        expect(body.parent_note).toBeNull()
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
      buffer: SYNTHETIC_PNG,
    })
    await expect(page.getByRole('status').filter({ hasText: '追加できました' })).toBeVisible()
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
      return response.json() as Promise<Memory>
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
