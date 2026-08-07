import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { defineConfig } from 'prisma/config'

const candidateRoot = process.env.HANA_CANDIDATE_ROOT
const githubWorkspace = process.env.GITHUB_WORKSPACE
const maxArtifactEntries = 10_000

function assertContained(root: string, path: string): void {
  const relativePath = relative(root, path)
  if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    throw new Error('candidate_artifact_outside_checkout')
  }
}

function assertRegularArtifactTree(root: string, path: string): void {
  let entries = 0
  const pending = [path]
  while (pending.length > 0) {
    const current = pending.pop()!
    const stat = lstatSync(current)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error('candidate_artifact_type_rejected')
    }
    assertContained(root, realpathSync(current))
    entries += 1
    if (entries > maxArtifactEntries) throw new Error('candidate_artifact_limit_exceeded')
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) pending.push(resolve(current, entry))
    }
  }
}

if (
  !candidateRoot ||
  !githubWorkspace ||
  !isAbsolute(candidateRoot) ||
  resolve(candidateRoot) !== resolve(githubWorkspace, 'candidate')
) {
  throw new Error('trusted_candidate_workspace_required')
}

const canonicalCandidateRoot = realpathSync(candidateRoot)
const schemaPath = resolve(canonicalCandidateRoot, 'prisma/schema.prisma')
const migrationsPath = resolve(canonicalCandidateRoot, 'prisma/migrations')
assertRegularArtifactTree(canonicalCandidateRoot, schemaPath)
assertRegularArtifactTree(canonicalCandidateRoot, migrationsPath)

export default defineConfig({
  schema: schemaPath,
  migrations: {
    path: migrationsPath,
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
})
