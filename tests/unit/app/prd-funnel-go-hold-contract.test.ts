import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const prdSource = readFileSync(new URL('../../../Hana_PRD_v1.md', import.meta.url), 'utf8')
const contractSource = readFileSync(
  new URL('../../../docs/product-validation/funnel-go-hold-contract.md', import.meta.url),
  'utf8',
)
const productEventSchemaSource = readFileSync(
  new URL('../../../docs/openapi/components/schemas/ProductEventReport.yaml', import.meta.url),
  'utf8',
)
const productEventSchema = parseYaml(productEventSchemaSource) as {
  properties?: { event_name?: { enum?: string[] } }
}
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-159-prd-funnel-go-hold.md', import.meta.url),
  'utf8',
)
const telemetryIssueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-152-pii-safe-telemetry.md', import.meta.url),
  'utf8',
)
const pilotIssueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-160-five-person-pilot.md', import.meta.url),
  'utf8',
)
const publicLpSource = readFileSync(
  new URL('../../../src/app/lp/page.tsx', import.meta.url),
  'utf8',
)
const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const currentLpArtifactSource = readFileSync(
  new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url),
  'utf8',
)

function section(source: string, heading: string, nextLevel: number): string {
  const marker = `${'#'.repeat(nextLevel)} ${heading}`
  const start = source.indexOf(marker)
  expect(start, `missing section: ${marker}`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf(`\n${'#'.repeat(nextLevel)} `, start + marker.length)
  return source.slice(start, next === -1 ? undefined : next)
}

function tableRows(source: string, heading: string, level: number): Array<Record<string, string>> {
  const tableSection = section(source, heading, level)
  const lines = tableSection.split('\n').filter((line) => line.startsWith('|'))
  expect(lines.length, `${heading} should contain a markdown table`).toBeGreaterThanOrEqual(3)
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
  const headerLine = lines.at(0)
  if (!headerLine) throw new Error(`${heading} is missing table headers`)
  const headers = cells(headerLine)
  return lines.slice(2).map((line) =>
    Object.fromEntries(
      cells(line).map((cell, index) => {
        const header = headers.at(index)
        if (!header) throw new Error(`${heading} row has more cells than headers`)
        return [header, cell]
      }),
    ),
  )
}

function frontmatterValue(source: string, key: string): string | undefined {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
}

describe('ISSUE-159 product validation contract', () => {
  it('classifies active claims without presenting unverified capabilities as current facts', () => {
    const claims = tableRows(contractSource, 'Active claims', 3)
    const claimByName = Object.fromEntries(claims.map((row) => [row.claim, row]))

    expect(claimByName['提供形態'].status).toBe('確認済み事実')
    expect(claimByName['PWA installability'].status).toBe('未実装・対象外')
    expect(claimByName['30秒 / 60秒'].status).toBe('検証仮説')
    expect(claimByName['vendor retention / training / ZDR'].status).toBe('未検証')

    const publicClaims = `${publicLpSource}\n${homeSource}\n${recordSource}\n${currentLpArtifactSource}`
    expect(publicClaims).not.toMatch(
      /30秒|30びょう|短時間|10年後の宝物|写真を、記憶にかえる|すぐ思い出せる|使うほど、公開する場所ではなく|App Store 準備中|Google Play 準備中/,
    )
    expect(currentLpArtifactSource).not.toContain('record-core-ai-390x844.png')
    expect(publicLpSource).toContain('写真に、ことばを添える。')
    expect(homeSource).toContain('AIの下書きか、自分のひとことを選べます。')
  })

  it('uses only the existing allowlisted product events', () => {
    const eventNames = productEventSchema.properties?.event_name?.enum ?? []

    expect(eventNames).toEqual([
      'record_started',
      'photo_selected',
      'ai_draft_shown',
      'memory_saved',
      'memory_viewed',
    ])
    for (const eventName of eventNames) expect(contractSource).toContain(`\`${eventName}\``)
    const contractEvents = tableRows(contractSource, 'Product events', 3).map((row) => {
      const event = row.event
      if (!event) throw new Error('Product events row is missing event')
      return event.replaceAll('`', '')
    })
    expect(contractEvents).toEqual(eventNames)
    expect(contractSource).toContain('この文書は新しいevent、API、永続fieldを追加しない')
  })

  it('defines every product decision metric with an explicit gate, minimum, missing rule, and target', () => {
    const metrics = tableRows(contractSource, 'Decision matrix', 2)
    expect(metrics.map((metric) => metric.ID)).toEqual(
      Array.from({ length: 12 }, (_, index) => `M${index + 1}`),
    )
    for (const metric of metrics) {
      expect(metric.gate).not.toBe('')
      expect(metric['eligible unit / window']).not.toBe('')
      expect(metric.min).not.toBe('')
      expect(metric['missing rule']).toMatch(/Hold/)
      expect(metric.target).not.toBe('')
    }

    expect(metrics.find((metric) => metric.ID === 'M3')?.target).toBe('75%以上')
    expect(metrics.find((metric) => metric.ID === 'M7')?.target).toBe('40%以上')
    expect(metrics.find((metric) => metric.ID === 'M12')?.target).toBe('0/5')
    expect(metrics.find((metric) => metric.ID === 'M2')?.min).toBe('20 Profile / flow')
    expect(metrics.find((metric) => metric.ID === 'M7')?.min).toBe('20 Profile / Profile-week')
    expect(contractSource).toContain('すべての窓はUTCの半開区間`[start, end)`')
    expect(contractSource).toContain(
      '発生minuteの半開区間全体が`[window_start_utc, window_end_utc)`に入る場合だけ',
    )
    expect(contractSource).toContain(
      'DB `createdAt`はreceipt timeとして遅延と順序の検証だけに使い、entryやmaturityの起点にしない',
    )
    expect(contractSource).toContain('M1 / M5 / M6: `Profile.createdAt`をanchor')
    expect(contractSource).toContain(
      'M2: `photo_selected`、M3: `ai_draft_shown`の発生minute区間をanchor',
    )
    expect(contractSource).toContain('entry window内で各Profileが最初に送ったeligible')
    expect(contractSource).toContain('同じcohortを見て閾値を決めてGoにしてはならない')
    expect(contractSource).toContain(
      '`baseline.generated_at_utc <= target_fixed_at_utc < evaluation.window_start_utc`',
    )
  })

  it('fails closed on best-effort telemetry, small cells, and evidence drift', () => {
    expect(contractSource).toContain('event送信失敗を離脱、未保存、未閲覧として扱わない')
    expect(contractSource).toContain(
      'ISSUE-152の相関・重複・順序・completeness証跡がGoになるまでHold',
    )
    expect(contractSource).toMatch(/分母、分子、補集合\s*`分母 - 分子`がすべて5以上/)
    expect(contractSource).toContain('secondary suppression')
    expect(contractSource).toContain('`metric ID + PASS / FAIL / HOLD`')
    expect(contractSource).toContain('cohort size、count、rate、percentile、属性は併記しない')
    expect(contractSource).toContain('status-only判定に必要なmin、completeness、query version')
    expect(contractSource).toContain('event依存cohortは1つの`actor_key_version`だけを使う')
    expect(contractSource).toContain('`metric_window_manifest`')
    expect(contractSource).toContain('`target_decision_digest`')
    expect(contractSource).toContain('right-censored')
    expect(contractSource).toContain('全censorを失敗とする下限`s / N`')
    expect(contractSource).toContain('全censorを成功とする上限')
    expect(contractSource).toContain('両端で判定が分かれる場合はHOLD')
    expect(contractSource).toContain('`eligible_census_digest`')
    expect(contractSource).toContain('`censoring_policy_version`')
    expect(contractSource).toContain('`censoring_status_digest`')
    expect(contractSource).toContain('`actor_key_version`')
    expect(contractSource).toContain('`evidence_digest`')
    expect(contractSource).toContain('digest不一致')
    expect(contractSource).toContain('| Product | pending |')
    expect(contractSource).toContain('| Privacy | pending |')
    expect(contractSource).toContain('**Hold（2026-08-07）**')
  })

  it('hands durable correlation, completeness, deletion censoring, and pilot timing to executable issues', () => {
    expect(telemetryIssueSource).toContain('下書き復元、写真変更、409 conflict、retry')
    expect(telemetryIssueSource).toContain('durable client outboxのack / retry')
    expect(telemetryIssueSource).toContain('expected-versus-received、loss、duplicate、reorder')
    expect(telemetryIssueSource).toContain('退会right-censor')
    expect(telemetryIssueSource).toContain('North Starのactive unit、UTC entry window')

    expect(pilotIssueSource).toContain('client monotonic timer')
    expect(pilotIssueSource).toContain('network時間を含める')
    expect(pilotIssueSource).toContain('retryでtimerをresetせず')
    expect(pilotIssueSource).toContain('metric IDとstatusだけ')
  })

  it('keeps the PRD conceptual and delegates storage fields to Prisma', () => {
    const dataModel = section(prdSource, 'データモデル', 2)
    expect(dataModel).toContain('`prisma/schema.prisma`')
    expect(dataModel).toContain('| ProductEvent |')
    expect(dataModel).not.toContain('```sql')
    expect(dataModel).not.toMatch(
      /location_name|gender\s+(?:varchar|text)|subscriptions\s*\{|family_members\s*\{/i,
    )

    const prdClaims = tableRows(prdSource, '現在のMVP契約', 2)
    expect(prdClaims.find((row) => row['項目'] === 'PWA installability')?.['状態']).toBe(
      '未実装・対象外',
    )

    const coreValue = section(prdSource, '5. コア価値', 1)
    expect(coreValue).toContain('見返し価値の検証仮説（未検証）')
    expect(coreValue).toContain('子ども本人への将来価値（MVP対象外の仮説）')
    expect(coreValue).toContain('祖父母共有（MVP対象外の仮説）')
    expect(coreValue).not.toContain('AIが代わりに書く')
    expect(coreValue).not.toContain('写真が「思い出」に変わる瞬間')
  })

  it('moves the issue to review after all specialist remediations are verified', () => {
    expect(frontmatterValue(issueSource, 'status')).toBe('review')
    expect(issueSource).toContain('Round 1（2026-08-07）: 6名全員HOLD')
    expect(issueSource).toContain('Round 2（2026-08-07）: 6名全員GO')
    expect(issueSource).toContain('Product / Privacyの人間reviewはpending')
  })
})
