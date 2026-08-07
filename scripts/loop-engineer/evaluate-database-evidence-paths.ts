const maxInputBytes = 16 * 1024 * 1024
const maxChangedFiles = 3000

const exactDatabaseSensitivePaths = new Set([
  '.env.example',
  '.github/workflows/loop-engineer-merge-gates.yml',
  '.github/workflows/typecheck.yml',
  'package.json',
  'pnpm-lock.yaml',
  'prisma.config.ts',
])

const databaseSensitivePrefixes = [
  'prisma/',
  'scripts/qa/',
  'src/app/internal/',
  'src/app/v1/',
  'src/server/',
  'tests/integration/',
  'tests/support/',
]

const databaseSensitivePathPatterns = [
  /^src\/app\/.+\/route\.ts$/,
  /^src\/features\/[^/]+\/server\//,
  /(?:^|[/_.-])(?:db|database|migration|persistence|postgres|prisma|rls)(?=$|[/_.-])/i,
]

function isRepositoryPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false
  if (value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return false
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function isDatabaseSensitivePath(path: string): boolean {
  return (
    exactDatabaseSensitivePaths.has(path) ||
    databaseSensitivePrefixes.some((prefix) => path.startsWith(prefix)) ||
    databaseSensitivePathPatterns.some((pattern) => pattern.test(path))
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
    const paths = JSON.parse(document) as unknown
    if (
      !Array.isArray(paths) ||
      paths.length === 0 ||
      paths.length > maxChangedFiles ||
      paths.some((path) => !isRepositoryPath(path)) ||
      new Set(paths).size !== paths.length
    ) {
      failClosed()
      return
    }

    process.stdout.write(`${paths.some(isDatabaseSensitivePath) ? 'true' : 'false'}\n`)
  } catch {
    failClosed()
  }
}

void main()
