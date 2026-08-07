const maxInputBytes = 32 * 1024 * 1024
const maxTreeEntries = 100_000
const inputFields = [
  'schema_version',
  'base_commit_sha',
  'head_commit_sha',
  'base_tree_sha',
  'head_tree_sha',
  'base_tree',
  'head_tree',
] as const

const exactDocumentationPaths = new Set(['AGENTS.md', 'CLAUDE.md', 'Hana_PRD_v1.md', 'README.md'])

type GitTreeEntry = {
  mode: '040000' | '100644' | '100755' | '120000' | '160000'
  type: 'blob' | 'commit' | 'tree'
  sha: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field))
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function isRepositoryPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false
  if (value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return false
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function isValidTreeEntryMode(type: string, mode: string): boolean {
  if (type === 'tree') return mode === '040000'
  if (type === 'commit') return mode === '160000'
  return type === 'blob' && ['100644', '100755', '120000'].includes(mode)
}

function readFileTree(value: unknown, expectedSha: string): Map<string, GitTreeEntry> | null {
  if (!isRecord(value) || value.sha !== expectedSha || value.truncated !== false) return null
  if (!Array.isArray(value.tree) || value.tree.length === 0 || value.tree.length > maxTreeEntries) {
    return null
  }

  const allPaths = new Set<string>()
  const entries = new Map<string, GitTreeEntry>()
  for (const entry of value.tree) {
    if (
      !isRecord(entry) ||
      !isRepositoryPath(entry.path) ||
      typeof entry.mode !== 'string' ||
      !/^[0-7]{6}$/.test(entry.mode) ||
      !['blob', 'commit', 'tree'].includes(String(entry.type)) ||
      !isValidTreeEntryMode(String(entry.type), entry.mode) ||
      !isSha(entry.sha) ||
      allPaths.has(entry.path)
    ) {
      return null
    }
    allPaths.add(entry.path)
    entries.set(entry.path, {
      mode: entry.mode as GitTreeEntry['mode'],
      type: entry.type as GitTreeEntry['type'],
      sha: entry.sha,
    })
  }

  return entries
}

function isSameTreeEntry(left: GitTreeEntry | undefined, right: GitTreeEntry | undefined): boolean {
  if (left?.type === 'tree' && right?.type === 'tree') return true
  return left?.mode === right?.mode && left?.type === right?.type && left?.sha === right?.sha
}

function requiresDatabaseEvidence(
  path: string,
  baseEntry: GitTreeEntry | undefined,
  headEntry: GitTreeEntry | undefined,
): boolean {
  const isDocumentation =
    exactDocumentationPaths.has(path) || (path.startsWith('docs/') && path.endsWith('.md'))
  const hasOnlyOrdinaryBlobs = [baseEntry, headEntry].every(
    (entry) => entry === undefined || (entry.type === 'blob' && entry.mode === '100644'),
  )
  return !isDocumentation || !hasOnlyOrdinaryBlobs
}

async function readStdin(): Promise<string | null> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.byteLength
    if (bytes > maxInputBytes) return null
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function failClosed(): void {
  process.stdout.write('true\n')
  process.exitCode = 1
}

async function main(): Promise<void> {
  const document = await readStdin()
  if (document === null) {
    failClosed()
    return
  }

  try {
    const input = JSON.parse(document) as unknown
    if (
      !isRecord(input) ||
      !hasExactFields(input, inputFields) ||
      input.schema_version !== 'loop-engineer-database-evidence-tree-input/v2' ||
      !isSha(input.base_commit_sha) ||
      !isSha(input.head_commit_sha) ||
      !isSha(input.base_tree_sha) ||
      !isSha(input.head_tree_sha) ||
      input.base_commit_sha === input.head_commit_sha ||
      input.base_tree_sha === input.head_tree_sha
    ) {
      failClosed()
      return
    }

    const baseFiles = readFileTree(input.base_tree, input.base_tree_sha)
    const headFiles = readFileTree(input.head_tree, input.head_tree_sha)
    if (!baseFiles || !headFiles) {
      failClosed()
      return
    }

    const changedPaths = [...new Set([...baseFiles.keys(), ...headFiles.keys()])].filter(
      (path) => !isSameTreeEntry(baseFiles.get(path), headFiles.get(path)),
    )
    if (changedPaths.length === 0) {
      failClosed()
      return
    }

    process.stdout.write(
      `${
        changedPaths.some((path) =>
          requiresDatabaseEvidence(path, baseFiles.get(path), headFiles.get(path)),
        )
          ? 'true'
          : 'false'
      }\n`,
    )
  } catch {
    failClosed()
  }
}

void main()
