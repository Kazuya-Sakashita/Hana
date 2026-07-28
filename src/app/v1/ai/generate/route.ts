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
import { ApiProblemError } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
// Claude API は haiku でも 5〜15 秒かかることがある
export const maxDuration = 60

const BUCKET = 'images'

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

interface ImageForAiPreparation {
  storageKey: string
}

async function prepareImageInputForClaude(
  supabase: SupabaseAdminClient,
  img: ImageForAiPreparation,
): Promise<AiImageInput> {
  const { data, error } = await supabase.storage.from(BUCKET).download(img.storageKey)
  if (error || !data) {
    console.error('storage.download failed', { reason: error ? 'storage_error' : 'no_data' })
    throw new Error('image fetch failed')
  }

  const arrayBuffer = await data.arrayBuffer()
  const originalBuffer = Buffer.from(arrayBuffer)
  // 元画像は Storage にフル品質で残し、Claude に渡すコピーだけを縮める (ADR-0011 §11)
  const resized = await resizeForClaude(originalBuffer)

  return {
    mediaType: resized.mediaType,
    base64: resized.buffer.toString('base64'),
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()
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
      where: { id: { in: input.imageIds }, deletedAt: null },
      select: { id: true, userId: true, storageKey: true, contentType: true },
    })
    if (images.length !== input.imageIds.length) {
      throw problems.validation([
        {
          path: 'body.image_ids',
          reason: 'image_not_found',
          message: '画像の一部が見つかりません',
        },
      ])
    }
    if (images.some((img) => img.userId !== user.id)) {
      throw problems.forbidden()
    }
    const unsupported = images.find((img) => !isMediaTypeSupportedByClaude(img.contentType))
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
    const supabase = createSupabaseAdminClient()
    const imageInputs = await Promise.all(
      images.map((img) => prepareImageInputForClaude(supabase, img)),
    )

    // 7. 月齢計算 (送信は month/day のみ。birthdate そのものは送らない・CLAUDE.md §7 PII)
    const recordedAtDate = input.recordedAt ?? new Date()
    const age = computeAge(child.birthdate, recordedAtDate)
    const recordedAtIso = recordedAtDate.toISOString().slice(0, 10)

    // 8. quota枠を原子的に予約してからClaudeへ
    const generationLog = await reserveMonthlyAiQuota({
      userId: user.id,
      childId: child.id,
      model: getAiModel(),
      promptVersion: PROMPT_VERSION,
    })
    generationLogId = generationLog.id

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
    )

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
    const shouldLogFailure =
      !!generationLogId &&
      !(
        isProblem &&
        ['unauthorized', 'forbidden', 'not_found', 'validation_error'].includes(e.reason)
      )
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
  }
}
