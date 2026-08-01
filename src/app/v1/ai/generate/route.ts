import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getAiModel } from '@/lib/ai/client'
import { parseAiGenerateRequest, readJsonBody } from '@/features/ai/server/parse'
import { computeAge, PROMPT_VERSION } from '@/features/ai/server/prompt'
import {
  AiOutputRejectedError,
  AiRetryFailedError,
  generateAi,
  isMediaTypeSupportedByClaude,
  type AiImageInput,
} from '@/features/ai/server/generate'
import { checkMonthlyQuota, reserveMonthlyAiQuota } from '@/features/ai/server/quota'
import { resizeForClaude } from '@/features/ai/server/resize'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import { ApiProblemError } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
// Claude API は haiku でも 5〜15 秒かかることがある
export const maxDuration = 60

const BUCKET = 'images'
const AI_TOTAL_EXTERNAL_WORK_DEADLINE_MS = 12_000
const AI_IMAGE_DOWNLOAD_TIMEOUT_MS = 8_000
const AI_IMAGE_PREPARATION_CONCURRENCY = 2
const IMAGE_ACCESS_TRANSACTION_TIMEOUT_MS = 30_000

interface ImageForAiPreparation {
  storageKey: string
}

function imageNotFoundProblem() {
  return problems.validation([
    {
      path: 'body.image_ids',
      reason: 'image_not_found',
      message: '画像の一部が見つかりません',
    },
  ])
}

async function prepareImageInputForClaude(
  img: ImageForAiPreparation,
  preparationSignal: AbortSignal,
): Promise<AiImageInput> {
  const signal = AbortSignal.any([
    preparationSignal,
    AbortSignal.timeout(AI_IMAGE_DOWNLOAD_TIMEOUT_MS),
  ])
  const supabase = createSupabaseAdminClient({ signal })
  const { data, error } = await supabase.storage.from(BUCKET).download(img.storageKey)
  if (signal.aborted) throw new Error('image fetch aborted')
  if (error || !data) {
    console.error('storage.download failed', { reason: error ? 'storage_error' : 'no_data' })
    throw new Error('image fetch failed')
  }

  const arrayBuffer = await data.arrayBuffer()
  if (signal.aborted) throw new Error('image fetch aborted')
  const originalBuffer = Buffer.from(arrayBuffer)
  // 元画像は Storage にフル品質で残し、Claude に渡すコピーだけを縮める (ADR-0011 §11)
  const resized = await resizeForClaude(originalBuffer)
  if (signal.aborted) throw new Error('image fetch aborted')

  return {
    mediaType: resized.mediaType,
    base64: resized.buffer.toString('base64'),
  }
}

async function prepareImageInputsForClaude(
  images: readonly ImageForAiPreparation[],
  requestDeadlineSignal: AbortSignal,
): Promise<AiImageInput[]> {
  const prepared = new Array<AiImageInput>(images.length)
  const preparationController = new AbortController()
  const preparationSignal = AbortSignal.any([preparationController.signal, requestDeadlineSignal])
  let nextIndex = 0
  let firstError: unknown
  const worker = async () => {
    while (!preparationSignal.aborted && nextIndex < images.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        prepared[index] = await prepareImageInputForClaude(images[index]!, preparationSignal)
      } catch (error) {
        if (!firstError) firstError = error
        preparationController.abort()
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(AI_IMAGE_PREPARATION_CONCURRENCY, images.length) },
    () => worker(),
  )
  await Promise.allSettled(workers)
  if (firstError) throw firstError
  return prepared
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const externalWorkDeadlineController = new AbortController()
  const externalWorkDeadline = setTimeout(
    () => externalWorkDeadlineController.abort(),
    AI_TOTAL_EXTERNAL_WORK_DEADLINE_MS,
  )
  const externalWorkDeadlineSignal = externalWorkDeadlineController.signal
  let generationLogId: string | undefined

  try {
    const user = await requireUser()

    // 1. AI 同意チェック
    if (!user.aiConsentAt) {
      throw problems.aiConsentRequired()
    }

    // 2. 月間 quota チェック
    const quota = await checkMonthlyQuota(user.id)
    if (!quota.ok) {
      throw problems.aiQuotaExceeded()
    }

    // 3. body 検証
    const raw = await readJsonBody(request)
    const input = parseAiGenerateRequest(raw)

    // 4. child 所有権 + 月齢計算用の birthdate 取得
    const child = await prisma.child.findFirst({
      where: { id: input.childId, deletedAt: null },
      select: { id: true, userId: true, name: true, birthdate: true },
    })
    if (!child) throw problems.notFound('指定した子どもが見つかりません')
    if (child.userId !== user.id) throw problems.forbidden()

    // 5. image 所有権検証
    const images = await prisma.image.findMany({
      where: {
        id: { in: input.imageIds },
        userId: user.id,
        deletedAt: null,
        memoryId: null,
        metadataSanitizedAt: { not: null },
      },
      select: { id: true, userId: true, storageKey: true, contentType: true },
    })
    if (images.length !== input.imageIds.length) {
      throw imageNotFoundProblem()
    }
    const imagesById = new Map(images.map((image) => [image.id, image]))
    const orderedImages = input.imageIds.flatMap((imageId) => {
      const image = imagesById.get(imageId)
      return image ? [image] : []
    })
    if (orderedImages.length !== input.imageIds.length) throw imageNotFoundProblem()
    const unsupported = orderedImages.find((img) => !isMediaTypeSupportedByClaude(img.contentType))
    if (unsupported) {
      // HEIC 等は Claude 非対応。クライアントには明示エラーを返す
      throw problems.validation([
        {
          path: 'body.image_ids',
          reason: 'media_type_not_supported_for_ai',
          message: 'この画像形式は AI 生成に対応していません (JPEG / PNG / WebP / GIF のみ)',
        },
      ])
    }

    // 6. Storage から画像取得 → resize (Claude 5MB 制約) → base64
    const imageInputs = await prepareImageInputsForClaude(orderedImages, externalWorkDeadlineSignal)

    // 7. 月齢計算 (送信は month/day のみ。birthdate そのものは送らない・CLAUDE.md §7 PII)
    const recordedAtDate = input.recordedAt ?? new Date()
    const age = computeAge(child.birthdate, recordedAtDate)
    const recordedAtIso = recordedAtDate.toISOString().slice(0, 10)

    // 準備中に撤回された場合、外部送信へ進む直前に止める。
    const latestConsent = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { aiConsentAt: true },
    })
    if (!latestConsent?.aiConsentAt) {
      throw problems.aiConsentRequired()
    }

    const generationLog = await reserveMonthlyAiQuota({
      userId: user.id,
      childId: child.id,
      model: getAiModel(),
      promptVersion: PROMPT_VERSION,
    })
    generationLogId = generationLog.id

    let generationAttempt:
      | { generationLogId: string; result: Awaited<ReturnType<typeof generateAi>> }
      | { generationLogId: string; error: unknown }
    generationAttempt = await prisma.$transaction(
      async (transaction) => {
        await lockImageAccess(transaction, input.imageIds)
        const latestImages = await transaction.image.findMany({
          where: {
            id: { in: input.imageIds },
            userId: user.id,
            deletedAt: null,
            memoryId: null,
            metadataSanitizedAt: { not: null },
          },
          select: { id: true },
        })
        if (latestImages.length !== input.imageIds.length) {
          throw imageNotFoundProblem()
        }

        try {
          externalWorkDeadlineSignal.throwIfAborted()
          const result = await generateAi(
            {
              childName: child.name,
              ageMonths: age.months,
              ageDays: age.days,
              recordedAt: recordedAtIso,
              weather: input.weather,
              parentNote: input.parentNote,
            },
            imageInputs,
            { signal: externalWorkDeadlineSignal },
          )
          return { generationLogId: generationLog.id, result }
        } catch (error) {
          return { generationLogId: generationLog.id, error }
        }
      },
      {
        maxWait: 5_000,
        timeout: IMAGE_ACCESS_TRANSACTION_TIMEOUT_MS,
      },
    )
    if ('error' in generationAttempt) throw generationAttempt.error
    const result = generationAttempt.result

    // 9. 成功ログ。生成本文自体は保管しない (PII)
    const log = await prisma.aiGeneration.update({
      where: { id: generationLogId },
      data: {
        succeeded: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - startTime,
        attemptCount: result.attempts,
        policyCategoryIds: result.policyRejections,
        policyOutcome:
          result.policyRejections.length > 0 ? 'accepted_after_retry' : 'accepted_first_attempt',
        errorReason: null,
      },
      select: { id: true },
    })

    return NextResponse.json({
      generation_id: log.id,
      title: result.title,
      body: result.body,
      tags: result.tags,
    })
  } catch (error) {
    const isOutputRejected = error instanceof AiOutputRejectedError
    const isRetryFailed = error instanceof AiRetryFailedError
    const policyFailure = isOutputRejected || isRetryFailed ? error : null
    const e = isOutputRejected ? problems.aiOutputRejected() : error

    // 失敗ログ (quota チェック・所有権チェック等は除く)
    const isProblem = e instanceof ApiProblemError
    const shouldLogFailure = !!generationLogId
    if (shouldLogFailure && generationLogId) {
      try {
        await prisma.aiGeneration.update({
          where: { id: generationLogId },
          data: {
            succeeded: false,
            inputTokens: policyFailure?.inputTokens,
            outputTokens: policyFailure?.outputTokens,
            durationMs: Date.now() - startTime,
            attemptCount: policyFailure?.attempts ?? 1,
            policyCategoryIds: policyFailure?.categoryIds ?? [],
            policyOutcome: isOutputRejected
              ? 'rejected_after_retry'
              : isRetryFailed
                ? 'retry_failed'
                : null,
            errorReason: isProblem ? e.reason : 'internal_error',
          },
        })
      } catch {
        // ログ失敗は無視
      }
    }

    if (!isProblem) {
      console.error('AI generate failed', { reason: 'internal_error' })
      return toProblemResponse(problems.aiGenerationFailed())
    }
    return toProblemResponse(e)
  } finally {
    clearTimeout(externalWorkDeadline)
  }
}
