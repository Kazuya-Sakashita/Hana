// 子どもの月齢計算 (UTC ベース)。Server / Client 共用の純粋関数。
//
// PRD §13 UX 設計: 月齢表示は「生後 127 日」より「生後 4ヶ月と 7日」の方が感情的。
// 元は ISSUE-010 の src/features/ai/server/prompt.ts にあったロジックを、
// ISSUE-013 で memory detail 画面 (Client Component) からも参照するため共有化。

/**
 * 撮影日と誕生日から、完全月数と当該月以降の経過日数を算出。
 * recordedAt が birthdate より前なら 0/0 にクランプ。
 */
export function computeAge(birthdate: Date, recordedAt: Date): { months: number; days: number } {
  const b = new Date(
    Date.UTC(birthdate.getUTCFullYear(), birthdate.getUTCMonth(), birthdate.getUTCDate()),
  )
  const r = new Date(
    Date.UTC(recordedAt.getUTCFullYear(), recordedAt.getUTCMonth(), recordedAt.getUTCDate()),
  )

  if (r.getTime() <= b.getTime()) {
    return { months: 0, days: 0 }
  }

  let months = (r.getUTCFullYear() - b.getUTCFullYear()) * 12 + (r.getUTCMonth() - b.getUTCMonth())
  let dayCursor = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + months, b.getUTCDate()))
  if (dayCursor.getTime() > r.getTime()) {
    months -= 1
    dayCursor = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + months, b.getUTCDate()))
  }
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(0, Math.floor((r.getTime() - dayCursor.getTime()) / dayMs))
  return { months: Math.max(0, months), days }
}

/**
 * 月齢を日本語の感情的なラベルに整形。
 *   - 0 ヶ月: "生後 14日"
 *   - n ヶ月: "生後 4ヶ月と 7日" (days=0 なら "生後 4ヶ月")
 */
export function formatAgeLabel(age: { months: number; days: number }): string {
  if (age.months === 0) {
    return `生後 ${age.days}日`
  }
  if (age.days === 0) {
    return `生後 ${age.months}ヶ月`
  }
  return `生後 ${age.months}ヶ月と ${age.days}日`
}
