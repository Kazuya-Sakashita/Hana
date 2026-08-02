import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

export const ISSUE_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const
const PRIORITIES = ['P0', 'P1', 'P2'] as const
const SIZES = ['S', 'M', 'M+', 'L'] as const
const ISSUE_ID_PATTERN = /^ISSUE-(\d{3})([a-z])?$/

export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export type IssueRecord = {
  id: string
  title: string
  priority: (typeof PRIORITIES)[number]
  status: IssueStatus
  size: (typeof SIZES)[number]
  createdAt: string
  githubIssue?: number
  blockedBy: string[]
  filePath: string
}

export type GithubIssueState = {
  number: number
  state: 'OPEN' | 'CLOSED'
}

type ParsedDocument = {
  data: Record<string, unknown>
  body: string
  frontmatter: string
}

function fail(filePath: string, message: string): never {
  throw new Error(`${basename(filePath)}: ${message}`)
}

export function parseIssueDocument(source: string, filePath: string): IssueRecord {
  const parsed = splitFrontmatter(source, filePath)
  const data = parsed.data

  const id = requireString(data.id, filePath, 'id')
  const idMatch = ISSUE_ID_PATTERN.exec(id)
  if (!idMatch) fail(filePath, 'id must match ISSUE-XXX or ISSUE-XXXa')
  if (!basename(filePath).startsWith(`${id}-`)) {
    fail(filePath, `filename must start with ${id}-`)
  }

  const title = requireString(data.title, filePath, 'title')
  const priority = requireEnum(data.priority, PRIORITIES, filePath, 'priority')
  const status = requireEnum(data.status, ISSUE_STATUSES, filePath, 'status')
  const size = requireEnum(data.size, SIZES, filePath, 'size')
  const createdAt = requireString(data.created_at, filePath, 'created_at')
  const parsedDate = new Date(`${createdAt}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(createdAt) ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== createdAt
  ) {
    fail(filePath, 'created_at must use YYYY-MM-DD')
  }

  const githubIssue = optionalPositiveInteger(data.github_issue, filePath, 'github_issue')
  const blockedBy = optionalStringArray(data.blocked_by, filePath, 'blocked_by')

  return {
    id,
    title,
    priority,
    status,
    size,
    createdAt,
    githubIssue,
    blockedBy,
    filePath,
  }
}

export function loadIssueRegistry(issueDirectory: string): IssueRecord[] {
  const issueFiles = selectIssueFiles(readdirSync(issueDirectory))

  const records = issueFiles.map((fileName) => {
    const filePath = join(issueDirectory, fileName)
    return parseIssueDocument(readFileSync(filePath, 'utf8'), filePath)
  })

  validateUniqueFields(records)
  return records.sort(compareIssueRecords)
}

export function selectIssueFiles(fileNames: string[]): string[] {
  const issueMarkdownFiles = fileNames.filter(
    (fileName) => fileName.startsWith('ISSUE-') && fileName.endsWith('.md'),
  )
  const invalidFileName = issueMarkdownFiles.find(
    (fileName) => !/^ISSUE-\d{3}[a-z]?-.+\.md$/.test(fileName),
  )
  if (invalidFileName) {
    throw new Error(`${invalidFileName}: filename must match ISSUE-XXX-<slug>.md`)
  }
  return issueMarkdownFiles.sort()
}

export function validateUniqueFields(records: IssueRecord[]): void {
  const ids = new Map<string, string>()
  const githubIssues = new Map<number, string>()

  for (const record of records) {
    const duplicateId = ids.get(record.id)
    if (duplicateId) {
      throw new Error(
        `duplicate id ${record.id}: ${basename(duplicateId)}, ${basename(record.filePath)}`,
      )
    }
    ids.set(record.id, record.filePath)

    if (record.githubIssue === undefined) continue
    const duplicateGithubIssue = githubIssues.get(record.githubIssue)
    if (duplicateGithubIssue) {
      throw new Error(
        `duplicate github_issue #${record.githubIssue}: ${basename(duplicateGithubIssue)}, ${basename(record.filePath)}`,
      )
    }
    githubIssues.set(record.githubIssue, record.filePath)
  }
}

export function renderIssueIndex(records: IssueRecord[]): string {
  const sorted = [...records].sort(compareIssueRecords)
  const byStatus = new Map<IssueStatus, IssueRecord[]>(
    ISSUE_STATUSES.map((status) => [status, sorted.filter((record) => record.status === status)]),
  )
  const statusById = new Map(sorted.map((record) => [record.id, record.status]))
  const ready = sorted.filter(
    (record) =>
      record.status === 'todo' &&
      (record.size === 'S' || record.size === 'M') &&
      record.blockedBy.every((id) => statusById.get(id) === 'done'),
  )

  const lines = [
    '# Hana Issue Index',
    '',
    'このファイルは `docs/issues/ISSUE-*.md` の frontmatter から生成されます。直接編集せず、`pnpm issues:write` を実行してください。',
    '',
    '- Issue本文の正本: `docs/issues/ISSUE-<number>[suffix]-*.md`',
    '- 検証: `pnpm issues:check`',
    '- GitHub状態照合: `pnpm issues:check-github -- --github-status-file <status-only.json>`',
    '- GitHubから扱う情報: Issue番号と `OPEN` / `CLOSED` のみ',
    '',
    '## Status Snapshot',
    '',
    '| status | count |',
    '| --- | ---: |',
    ...ISSUE_STATUSES.map((status) => `| \`${status}\` | ${byStatus.get(status)?.length ?? 0} |`),
    '',
    '## Codex Ready Queue',
    '',
    ...renderIssueTableOrEmpty(ready),
    '',
    'ready条件: `status: todo`、sizeがS/M、`blocked_by` が空またはすべてdone。',
    '',
    '## In Progress',
    '',
    ...renderIssueTableOrEmpty(byStatus.get('in_progress') ?? []),
    '',
    '## Review Queue',
    '',
    ...renderIssueTableOrEmpty(byStatus.get('review') ?? []),
    '',
    '## Blocked Or Needs Human Decision',
    '',
    ...renderIssueTableOrEmpty(byStatus.get('blocked') ?? []),
    '',
    '## All Issues',
    '',
    ...renderIssueTableOrEmpty(sorted),
    '',
    '## Status Rules',
    '',
    '- `todo`: 受け入れ条件があり、未着手',
    '- `in_progress`: 現在のbranchで作業中',
    '- `review`: 実装・検証済みで、PR reviewまたは人間確認待ち',
    '- `done`: merge済み、またはIssueの目的が完了済み',
    '- `blocked`: 人間判断、外部依存、credential、設計未決定で停止',
    '',
    '1 Issue 1 PRを守ります。merge済みIssueの状態同期だけを目的にしたmaintenance Issueは、そのPR内でdoneへ更新できます。',
    '',
  ]

  return lines.join('\n')
}

export function parseGithubIssueStates(source: string): GithubIssueState[] {
  const value: unknown = JSON.parse(source)
  if (!Array.isArray(value)) throw new Error('GitHub status input must be an array')

  const seen = new Set<number>()
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('GitHub status entry must be an object')
    }
    const keys = Object.keys(entry)
    if (keys.some((key) => key !== 'number' && key !== 'state')) {
      throw new Error('GitHub status input may contain only number and state')
    }
    const number = Reflect.get(entry, 'number')
    const state = Reflect.get(entry, 'state')
    if (!Number.isInteger(number) || (number as number) < 1) {
      throw new Error('GitHub status number must be a positive integer')
    }
    if (state !== 'OPEN' && state !== 'CLOSED') {
      throw new Error(`GitHub status for #${number as number} must be OPEN or CLOSED`)
    }
    if (seen.has(number as number)) throw new Error(`duplicate GitHub status #${number as number}`)
    seen.add(number as number)
    return { number: number as number, state }
  })
}

export function findGithubStateMismatches(
  records: IssueRecord[],
  states: GithubIssueState[],
): string[] {
  const stateByNumber = new Map(states.map((state) => [state.number, state.state]))
  const mismatches: string[] = []

  for (const record of records) {
    if (record.githubIssue === undefined) continue
    const githubState = stateByNumber.get(record.githubIssue)
    if (!githubState) {
      mismatches.push(`${record.id} #${record.githubIssue}: local=${record.status}, github=MISSING`)
      continue
    }
    if (githubState === 'CLOSED' && record.status !== 'done') {
      mismatches.push(`${record.id} #${record.githubIssue}: local=${record.status}, github=CLOSED`)
    }
    if (githubState === 'OPEN' && record.status === 'done') {
      mismatches.push(`${record.id} #${record.githubIssue}: local=done, github=OPEN`)
    }
  }

  return mismatches
}

export function markClosedIssuesDone(
  source: string,
  filePath: string,
  closedGithubIssues: ReadonlySet<number>,
): { source: string; changed: boolean } {
  const parsed = splitFrontmatter(source, filePath)
  const githubIssue = optionalPositiveInteger(parsed.data.github_issue, filePath, 'github_issue')
  const status = parsed.data.status
  if (githubIssue === undefined || !closedGithubIssues.has(githubIssue) || status !== 'review') {
    return { source, changed: false }
  }

  const nextFrontmatter = parsed.frontmatter.replace(
    /^status:\s*(todo|in_progress|review|blocked)\s*$/m,
    'status: done',
  )
  if (nextFrontmatter === parsed.frontmatter) {
    fail(filePath, 'could not update status to done')
  }
  return {
    source: `---\n${nextFrontmatter}\n---\n${parsed.body}`,
    changed: true,
  }
}

function renderIssueTableOrEmpty(records: IssueRecord[]): string[] {
  if (records.length === 0) return ['現在はありません。']
  return [
    '| Issue | GitHub | status | priority | size | title | blocked_by |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
    ...records.map((record) => {
      const github = record.githubIssue === undefined ? '-' : `\`#${record.githubIssue}\``
      const blockers = record.blockedBy.length === 0 ? '-' : record.blockedBy.join(', ')
      return `| \`${record.id}\` | ${github} | \`${record.status}\` | ${record.priority} | ${record.size} | ${escapeCell(record.title)} | ${escapeCell(blockers)} |`
    }),
  ]
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function compareIssueRecords(left: IssueRecord, right: IssueRecord): number {
  const leftMatch = ISSUE_ID_PATTERN.exec(left.id)
  const rightMatch = ISSUE_ID_PATTERN.exec(right.id)
  if (!leftMatch || !rightMatch) return left.id.localeCompare(right.id)
  const numeric = Number(leftMatch[1]) - Number(rightMatch[1])
  if (numeric !== 0) return numeric
  return (leftMatch[2] ?? '').localeCompare(rightMatch[2] ?? '')
}

function splitFrontmatter(source: string, filePath: string): ParsedDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source)
  if (!match) fail(filePath, 'missing YAML frontmatter')
  const frontmatter = match[1]
  const body = match[2]
  if (frontmatter === undefined || body === undefined) fail(filePath, 'invalid YAML frontmatter')
  const data: unknown = parse(frontmatter)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail(filePath, 'frontmatter must be an object')
  }
  return { data: data as Record<string, unknown>, body, frontmatter }
}

function requireString(value: unknown, filePath: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(filePath, `${field} is required`)
  return value
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  filePath: string,
  field: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(filePath, `${field} must be one of ${allowed.join(', ')}`)
  }
  return value as T[number]
}

function optionalPositiveInteger(
  value: unknown,
  filePath: string,
  field: string,
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 1) {
    fail(filePath, `${field} must be a positive integer`)
  }
  return value as number
}

function optionalStringArray(value: unknown, filePath: string, field: string): string[] {
  if (value === undefined) return []
  const values = Array.isArray(value) ? value : [value]
  if (values.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    fail(filePath, `${field} must contain non-empty strings`)
  }
  return values as string[]
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function parseArgument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

async function runCli(): Promise<void> {
  const command = process.argv[2]
  const args = process.argv.slice(3)
  const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const issueDirectory = join(repositoryRoot, 'docs/issues')
  const indexPath = join(issueDirectory, 'README.md')
  let records = loadIssueRegistry(issueDirectory)

  if (command === 'write') {
    writeFileSync(indexPath, renderIssueIndex(records))
    console.info(`issue registry written: ${records.length} issues`)
    return
  }

  if (command === 'check') {
    const expected = renderIssueIndex(records)
    const current = readFileSync(indexPath, 'utf8')
    if (current !== expected) {
      throw new Error('docs/issues/README.md is stale; run pnpm issues:write')
    }
    console.info(`issue registry valid: ${records.length} issues`)
    return
  }

  if (command === 'check-github' || command === 'sync-github') {
    const statusFile = parseArgument(args, '--github-status-file')
    const useStdin = args.includes('--github-status-stdin')
    if ((statusFile === undefined) === !useStdin) {
      throw new Error('provide exactly one of --github-status-file or --github-status-stdin')
    }
    const input = statusFile ? readFileSync(resolve(statusFile), 'utf8') : await readStdin()
    const states = parseGithubIssueStates(input)

    if (command === 'sync-github') {
      const closed = new Set(
        states.filter((state) => state.state === 'CLOSED').map((state) => state.number),
      )
      let changedCount = 0
      for (const record of records) {
        const source = readFileSync(record.filePath, 'utf8')
        const updated = markClosedIssuesDone(source, record.filePath, closed)
        if (!updated.changed) continue
        writeFileSync(record.filePath, updated.source)
        changedCount += 1
      }
      records = loadIssueRegistry(issueDirectory)
      writeFileSync(indexPath, renderIssueIndex(records))
      console.info(`issue status sync complete: ${changedCount} updated`)
      return
    }

    const mismatches = findGithubStateMismatches(records, states)
    if (mismatches.length > 0) {
      throw new Error(`GitHub status drift (${mismatches.length}):\n${mismatches.join('\n')}`)
    }
    console.info(`GitHub status alignment valid: ${states.length} status-only records`)
    return
  }

  throw new Error('usage: issue-registry.ts <write|check|check-github|sync-github>')
}

const isCli =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'issue registry command failed')
    process.exitCode = 1
  })
}
