import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { createAnthropicClient, getAiModel } from '@/lib/ai/client'
import { buildUserPrompt, SYSTEM_PROMPT, type PromptParams } from './prompt'

// Claude が受け入れる画像 MIME
type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface AiImageInput {
  mediaType: string
  base64: string
}

export interface AiGenerateResult {
  title: string
  body: string
  tags: string[]
  inputTokens: number
  outputTokens: number
}

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function isMediaTypeSupportedByClaude(mime: string): mime is SupportedMediaType {
  return SUPPORTED_MEDIA_TYPES.includes(mime)
}

export async function generateAi(
  params: PromptParams,
  images: AiImageInput[],
  options?: { client?: Anthropic; model?: string },
): Promise<AiGenerateResult> {
  const client = options?.client ?? createAnthropicClient()
  const model = options?.model ?? getAiModel()
  const userPrompt = buildUserPrompt(params)

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => {
            if (!isMediaTypeSupportedByClaude(img.mediaType)) {
              throw new Error(`Unsupported media type for Claude: ${img.mediaType}`)
            }
            return {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.base64,
              },
            }
          }),
          { type: 'text' as const, text: userPrompt },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude did not return a text block')
  }

  const parsed = parseJsonResponse(textBlock.text)
  return {
    title: parsed.title,
    body: parsed.body,
    tags: parsed.tags,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

interface ParsedResult {
  title: string
  body: string
  tags: string[]
}

export function parseJsonResponse(text: string): ParsedResult {
  // code fence (```json ... ```) を剥がす
  let trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/)
  if (fenceMatch?.[1]) trimmed = fenceMatch[1].trim()

  // 文章の中から最初の { ... } を抽出
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in Claude response')
  }
  const jsonText = trimmed.slice(start, end + 1)

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    throw new Error('Claude response is not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Claude response is not a JSON object')
  }
  const obj = raw as Record<string, unknown>

  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  const body = typeof obj.body === 'string' ? obj.body.trim() : ''
  if (!title || !body) {
    throw new Error('Claude response is missing title or body')
  }

  const tags: string[] = []
  if (Array.isArray(obj.tags)) {
    for (const t of obj.tags) {
      if (typeof t === 'string' && t.trim().length > 0 && t.length <= 30) {
        tags.push(t.trim())
        if (tags.length >= 5) break
      }
    }
  }

  return { title, body, tags }
}
