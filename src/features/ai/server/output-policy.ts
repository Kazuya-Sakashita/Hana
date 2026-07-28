import 'server-only'

export const AI_OUTPUT_POLICY_CATEGORY_IDS = [
  'title_length_out_of_range',
  'body_length_out_of_range',
  'placeholder_detected',
  'ai_self_reference',
  'social_media_expression',
  'medical_development_claim',
  'emotion_assertion',
  'exaggerated_expression',
  'location_assertion',
] as const

export type AiOutputPolicyCategoryId = (typeof AI_OUTPUT_POLICY_CATEGORY_IDS)[number]

interface AiOutputForPolicy {
  title: string
  body: string
}

interface AiOutputPolicyContext {
  userProvidedText?: string[]
}

type AiOutputPolicyResult =
  | { ok: true }
  | {
      ok: false
      categoryIds: AiOutputPolicyCategoryId[]
    }

const PLACEHOLDER_PATTERN =
  /\{\{?[^{}\n]{1,40}\}?\}|(?:○○|〇〇|XX)(?:ちゃん|くん|さん)?|(?:子どもの名前|お名前)(?:を入力|未設定)/i
const AI_SELF_REFERENCE_PATTERN =
  /(?:私|わたし)(?:は|が)(?:AI|生成AI|人工知能|言語モデル|アシスタント)(?:です|でした)|(?:\bAI\b|生成AI|人工知能|言語モデル|アシスタント|Claude|ChatGPT)(?:(?:が|で|として|によって)?(?:生成|作成|書き|回答|考え)|(?:の|による)(?:下書き|文章|記録))/
const SOCIAL_MEDIA_EXPRESSION_PATTERN = /SNS映え|インスタ映え|キラキラ|映え(?:る|た|ます|ました)/
const MEDICAL_DEVELOPMENT_PATTERN =
  /発達(?:が|は)(?:とても)?(?:早い|遅い|順調)|発達の遅れ|(?:優れた|高い|低い)運動能力|運動能力(?:が|は)(?:とても)?(?:優れ|高|低)|(?:自閉症|ADHD|発達障害|病気|疾患)(?:です|でした|でしょう|に違いありません)/
const EMOTION_ASSERTION_PATTERN =
  /(?:この|その)瞬間[、,\s]*(?:涙が(?:溢|あふ)れました|胸が(?:いっぱい|熱く)なりました)|(?:絶対に|間違いなく|きっと)(?:うれしい|嬉しい|悲しい|楽しい|幸せ)(?:と感じ|な気持ち)/
const EXAGGERATED_EXPRESSION_PATTERN =
  /奇跡のような瞬間|天使のような笑顔|世界一(?:かわいい|可愛い|幸せ)|完璧な(?:瞬間|笑顔)/
const EXPLICIT_LOCATION_PATTERN =
  /(?:撮影場所|場所)(?:は|：|:)\s*([^。！？\n]{1,40}?)(?:です|でした)/g
const NAMED_LOCATION_PATTERN =
  /([一-龠々ぁ-んァ-ヶA-Za-z0-9]{2,30}(?:公園|動物園|水族館|博物館|美術館|図書館|病院|保育園|幼稚園|学校|神社|寺|駅|市|区|町|村|都|道|府|県))(?:で|にて|へ|に)/g
const LOCATION_SUFFIXES = [
  '動物園',
  '水族館',
  '博物館',
  '美術館',
  '図書館',
  '保育園',
  '幼稚園',
  '公園',
  '病院',
  '学校',
  '神社',
  '寺',
  '駅',
  '市',
  '区',
  '町',
  '村',
  '都',
  '道',
  '府',
  '県',
] as const

function codePointLength(value: string): number {
  return Array.from(value).length
}

function hasUnsupportedLocationAssertion(
  value: string,
  context: AiOutputPolicyContext | undefined,
): boolean {
  const userProvidedText = context?.userProvidedText?.join('\n') ?? ''
  const assertedLocations = [
    ...Array.from(value.matchAll(EXPLICIT_LOCATION_PATTERN), (match) => match[1]?.trim() ?? ''),
    ...Array.from(value.matchAll(NAMED_LOCATION_PATTERN), (match) => match[1]?.trim() ?? ''),
  ].filter(Boolean)
  return assertedLocations.some((location) => {
    if (userProvidedText.includes(location)) return false
    const codePoints = Array.from(location)
    return !codePoints.some((_, index) => {
      const suffix = codePoints.slice(index).join('')
      const locationSuffix = LOCATION_SUFFIXES.find((candidate) => suffix.endsWith(candidate))
      return (
        !!locationSuffix &&
        Array.from(suffix).length > Array.from(locationSuffix).length &&
        userProvidedText.includes(suffix)
      )
    })
  })
}

export function evaluateAiOutputPolicy(
  output: AiOutputForPolicy,
  context?: AiOutputPolicyContext,
): AiOutputPolicyResult {
  const categoryIds: AiOutputPolicyCategoryId[] = []
  const combined = `${output.title}\n${output.body}`

  if (codePointLength(output.title) > 10) {
    categoryIds.push('title_length_out_of_range')
  }
  const bodyLength = codePointLength(output.body)
  if (bodyLength < 80 || bodyLength > 150) {
    categoryIds.push('body_length_out_of_range')
  }
  if (PLACEHOLDER_PATTERN.test(combined)) {
    categoryIds.push('placeholder_detected')
  }
  if (AI_SELF_REFERENCE_PATTERN.test(combined)) {
    categoryIds.push('ai_self_reference')
  }
  if (SOCIAL_MEDIA_EXPRESSION_PATTERN.test(combined)) {
    categoryIds.push('social_media_expression')
  }
  if (MEDICAL_DEVELOPMENT_PATTERN.test(combined)) {
    categoryIds.push('medical_development_claim')
  }
  if (EMOTION_ASSERTION_PATTERN.test(combined)) {
    categoryIds.push('emotion_assertion')
  }
  if (EXAGGERATED_EXPRESSION_PATTERN.test(combined)) {
    categoryIds.push('exaggerated_expression')
  }
  if (hasUnsupportedLocationAssertion(combined, context)) {
    categoryIds.push('location_assertion')
  }

  return categoryIds.length === 0 ? { ok: true } : { ok: false, categoryIds }
}
