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
  generateAi,
  isMediaTypeSupportedByClaude,
  type AiImageInput,
} from '@/features/ai/server/generate'
import { checkMonthlyQuota } from '@/features/ai/server/quota'
import { ApiProblemError } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
// Claude API は haiku でも 5〜15 秒かかることがある
export const maxDuration = 60

const BUCKET = 'images'

export async function POST(request: Request) {
  const startTime = Date.now()
  let userIdForLog: string | undefined
  let childIdForLog: string | undefined

  try {
    const user = await requireUser()
    userIdForLog = user.id

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
    childIdForLog = input.childId

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

    // 6. Storage から画像取得 → base64
    const supabase = createSupabaseAdminClient()
    const imageInputs: AiImageInput[] = []
    for (const img of images) {
      const { data, error } = await supabase.storage.from(BUCKET).download(img.storageKey)
      if (error || !data) {
        console.error('storage.download failed', { reason: error?.message ?? 'no_data' })
        throw new Error('image fetch failed')
      }
      const buffer = await data.arrayBuffer()
      imageInputs.push({
        mediaType: img.contentType,
        base64: Buffer.from(buffer).toString('base64'),
      })
    }

    // 7. 月齢計算 (送信は month/day のみ。birthdate そのものは送らない・CLAUDE.md §7 PII)
    const recordedAtDate = input.recordedAt ?? new Date()
    const age = computeAge(child.birthdate, recordedAtDate)
    const recordedAtIso = recordedAtDate.toISOString().slice(0, 10)

    // 8. Claude へ
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
    const log = await prisma.aiGeneration.create({
      data: {
        userId: user.id,
        childId: child.id,
        model: getAiModel(),
        promptVersion: PROMPT_VERSION,
        succeeded: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - startTime,
      },
    })

    return NextResponse.json({
      generation_id: log.id,
      title: result.title,
      body: result.body,
      tags: result.tags,
    })
  } catch (e) {
    // 失敗ログ (quota チェック・所有権チェック等は除く)
    const isProblem = e instanceof ApiProblemError
    const shouldLogFailure =
      userIdForLog &&
      !(
        isProblem &&
        ['unauthorized', 'forbidden', 'not_found', 'validation_error'].includes(e.reason)
      )
    if (shouldLogFailure && userIdForLog) {
      try {
        await prisma.aiGeneration.create({
          data: {
            userId: userIdForLog,
            childId: childIdForLog,
            model: getAiModel(),
            promptVersion: PROMPT_VERSION,
            succeeded: false,
            durationMs: Date.now() - startTime,
            errorReason: isProblem ? e.reason : 'internal_error',
          },
        })
      } catch {
        // ログ失敗は無視
      }
    }

    if (!isProblem) {
      console.error('AI generate failed', { error: e instanceof Error ? e.message : String(e) })
      return toProblemResponse(problems.aiGenerationFailed())
    }
    return toProblemResponse(e)
  }
}
