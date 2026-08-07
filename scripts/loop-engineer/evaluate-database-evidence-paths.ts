const maxInputBytes = 32 * 1024 * 1024
const maxTreeEntries = 100_000
const inputFields = ['schema_version', 'base_sha', 'head_sha', 'base_tree', 'head_tree'] as const

const exactDatabaseSensitivePaths = new Set([
  '.env.example',
  'package.json',
  'pnpm-lock.yaml',
  'prisma.config.ts',
  'tests/e2e/support/database.ts',
])

const databaseSensitivePrefixes = [
  'database/',
  'db/',
  'migrations/',
  'prisma/',
  'scripts/maintenance/',
  'scripts/qa/',
  'src/',
  'supabase/',
  'tests/integration/',
  'tests/support/',
]

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

function readFileTree(value: unknown, expectedSha: string): Map<string, string> | null {
  if (!isRecord(value) || value.sha !== expectedSha || value.truncated !== false) return null
  if (!Array.isArray(value.tree) || value.tree.length === 0 || value.tree.length > maxTreeEntries) {
    return null
  }

  const allPaths = new Set<string>()
  const files = new Map<string, string>()
  for (const entry of value.tree) {
    if (
      !isRecord(entry) ||
      !isRepositoryPath(entry.path) ||
      typeof entry.mode !== 'string' ||
      !/^[0-7]{6}$/.test(entry.mode) ||
      !['blob', 'commit', 'tree'].includes(String(entry.type)) ||
      !isSha(entry.sha) ||
      allPaths.has(entry.path)
    ) {
      return null
    }
    allPaths.add(entry.path)
    if (entry.type !== 'tree') {
      files.set(entry.path, `${entry.type}:${entry.mode}:${entry.sha}`)
    }
  }

  return files
}

function isDatabaseSensitivePath(path: string): boolean {
  return (
    exactDatabaseSensitivePaths.has(path) ||
    databaseSensitivePrefixes.some((prefix) => path.startsWith(prefix))
  )
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
      input.schema_version !== 'loop-engineer-database-evidence-tree-input/v1' ||
      !isSha(input.base_sha) ||
      !isSha(input.head_sha) ||
      input.base_sha === input.head_sha
    ) {
      failClosed()
      return
    }

    const baseFiles = readFileTree(input.base_tree, input.base_sha)
    const headFiles = readFileTree(input.head_tree, input.head_sha)
    if (!baseFiles || !headFiles) {
      failClosed()
      return
    }

    const changedPaths = [...new Set([...baseFiles.keys(), ...headFiles.keys()])].filter(
      (path) => baseFiles.get(path) !== headFiles.get(path),
    )
    if (changedPaths.length === 0) {
      failClosed()
      return
    }

    process.stdout.write(`${changedPaths.some(isDatabaseSensitivePath) ? 'true' : 'false'}\n`)
  } catch {
    failClosed()
  }
}

void main()
