import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

// Anthropic Claude API client。**サーバ閉じ込め**。
// ANTHROPIC_API_KEY と AI_MODEL は .env.local で設定する。
//
// MVP の方針 (ADR-0011):
//   - claude-haiku-4-5 を default (速さ + コストのバランス)
//   - prompt caching を活用 (system prompt が安定なため)
//   - Vercel AI Gateway は ISSUE-023 (Vercel deploy) で別途検討

const DEFAULT_MODEL = 'claude-haiku-4-5'

let cached: Anthropic | null = null

export function createAnthropicClient(): Anthropic {
  if (cached) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  cached = new Anthropic({ apiKey })
  return cached
}

export function getAiModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL
}
