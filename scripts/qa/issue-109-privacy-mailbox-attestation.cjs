const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ts = require('typescript')

const issue = 'ISSUE-109'
const repoRoot = process.cwd()
const attestationVersion = 'prelaunch-mailbox-v1'
const attestationScope = 'prelaunch'

const files = {
  script: 'scripts/qa/issue-109-privacy-mailbox-attestation.cjs',
  packageJson: 'package.json',
  releaseDoc: 'docs/release/prelaunch-waitlist-readiness.md',
  issueDoc: 'docs/issues/ISSUE-109-privacy-mailbox-attestation.md',
  issue103Script: 'scripts/qa/issue-103-prelaunch-traffic-attestation.cjs',
  issue105Doc: 'docs/issues/ISSUE-105-staging-preflight-go-hold.md',
  issueIndex: 'docs/issues/README.md',
}

const attestationArguments = [
  { id: 'mailbox-receiving-confirmed', name: 'receiving' },
  { id: 'mailbox-access-control-confirmed', name: 'access-control' },
  { id: 'guidance-stop-operation-confirmed', name: 'guidance-stop' },
  { id: 'registration-deletion-operation-confirmed', name: 'registration-deletion' },
]

const allowedArgumentNames = new Set(['mode', ...attestationArguments.map(({ name }) => name)])

function parseArguments(argv) {
  const tokens = [...argv]
  if (tokens[0] === '--') tokens.shift()
  const values = new Map()

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--') || token === '--') throw new Error('invalid_arguments')

    const separatorIndex = token.indexOf('=')
    const name = token.slice(2, separatorIndex >= 0 ? separatorIndex : undefined)
    let value = separatorIndex >= 0 ? token.slice(separatorIndex + 1) : ''

    if (separatorIndex < 0) {
      const nextToken = tokens[index + 1]
      if (!nextToken || nextToken.startsWith('--')) throw new Error('invalid_arguments')
      value = nextToken
      index += 1
    }

    if (!allowedArgumentNames.has(name) || values.has(name) || value.length === 0) {
      throw new Error('invalid_arguments')
    }
    values.set(name, value)
  }

  const requestedMode = values.get('mode') ?? 'contract'
  const mode = ['contract', 'attest'].includes(requestedMode) ? requestedMode : 'unsupported'
  if (mode === 'contract' && [...values.keys()].some((name) => name !== 'mode')) {
    throw new Error('invalid_arguments')
  }

  return { mode, values }
}

function source(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
}

function assertIncludes(sourceText, needle, label) {
  if (!sourceText.includes(needle)) throw new Error(`${label}:missing_contract`)
}

function assertReadOnlySource(sourceText) {
  const sourceFile = ts.createSourceFile(
    'issue-109-privacy-mailbox-attestation.cjs',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const imports = []
  const dangerousCalls = new Set([
    'appendFile',
    'appendFileSync',
    'connect',
    'console',
    'createDirectory',
    'createWriteStream',
    'eval',
    'exec',
    'execFile',
    'fetch',
    'fork',
    'Function',
    'mkdir',
    'mkdirSync',
    'open',
    'openSync',
    'rename',
    'renameSync',
    'request',
    'rm',
    'rmSync',
    'rmdir',
    'rmdirSync',
    'spawn',
    'truncate',
    'truncateSync',
    'unlink',
    'unlinkSync',
    'deleteFile',
    'WebSocket',
    'writeFile',
    'writeFileSync',
  ])
  const blockedIdentifiers = new Set([
    'Bun',
    'console',
    'Deno',
    'eval',
    'fetch',
    'Function',
    'global',
    'globalThis',
    'WebSocket',
    'XMLHttpRequest',
  ])
  const allowedTypescriptProperties = new Set([
    'createSourceFile',
    'forEachChild',
    'isCallExpression',
    'isElementAccessExpression',
    'isFunctionDeclaration',
    'isIdentifier',
    'isNewExpression',
    'isObjectBindingPattern',
    'isPropertyAccessExpression',
    'isStringLiteral',
    'isVariableDeclaration',
    'ScriptKind',
    'ScriptTarget',
    'SyntaxKind',
  ])

  function reject(reason = 'read-only-policy:forbidden_operation') {
    throw new Error(reason)
  }

  function bindingNames(name) {
    if (!ts.isObjectBindingPattern(name)) return null
    return name.elements.map((element) =>
      ts.isIdentifier(element.name) && element.propertyName === undefined ? element.name.text : '',
    )
  }

  function enclosingFunctionName(node) {
    let current = node.parent
    while (current) {
      if (ts.isFunctionDeclaration(current)) return current.name?.text ?? ''
      current = current.parent
    }
    return ''
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) reject()

      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const moduleArgument = node.arguments[0]
        if (
          node.arguments.length !== 1 ||
          !moduleArgument ||
          !ts.isStringLiteral(moduleArgument) ||
          !ts.isVariableDeclaration(node.parent)
        ) {
          reject('read-only-policy:forbidden_import')
        }

        const moduleName = moduleArgument.text
        const declarationName = node.parent.name
        if (moduleName === 'node:fs') {
          if (JSON.stringify(bindingNames(declarationName)) !== JSON.stringify(['readFileSync'])) {
            reject('read-only-policy:forbidden_import')
          }
        } else if (moduleName === 'node:path') {
          if (JSON.stringify(bindingNames(declarationName)) !== JSON.stringify(['join'])) {
            reject('read-only-policy:forbidden_import')
          }
        } else if (
          moduleName !== 'typescript' ||
          !ts.isIdentifier(declarationName) ||
          declarationName.text !== 'ts'
        ) {
          reject('read-only-policy:forbidden_import')
        }
        imports.push(moduleName)
      } else if (ts.isIdentifier(node.expression) && dangerousCalls.has(node.expression.text)) {
        reject()
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        dangerousCalls.has(node.expression.name.text)
      ) {
        reject()
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'readFileSync' &&
        enclosingFunctionName(node) !== 'source'
      ) {
        reject()
      }

      const isStdoutWrite =
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'write' &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        ts.isIdentifier(node.expression.expression.expression) &&
        node.expression.expression.expression.text === 'process' &&
        node.expression.expression.name.text === 'stdout'
      if (isStdoutWrite && enclosingFunctionName(node) !== 'emit') reject()
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      dangerousCalls.has(node.expression.text)
    ) {
      reject()
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ['constructor', '__proto__', 'prototype'].includes(node.name.text)
    ) {
      reject()
    }

    if (ts.isIdentifier(node) && blockedIdentifiers.has(node.text)) reject()

    if (ts.isIdentifier(node) && node.text === 'process') {
      if (
        !ts.isPropertyAccessExpression(node.parent) ||
        node.parent.expression !== node ||
        !['argv', 'cwd', 'exitCode', 'permission', 'stdout'].includes(node.parent.name.text)
      ) {
        reject()
      }
    }

    if (ts.isIdentifier(node) && node.text === 'require') {
      const isRequireCall = ts.isCallExpression(node.parent) && node.parent.expression === node
      const isRequireMain =
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.expression === node &&
        node.parent.name.text === 'main'
      if (!isRequireCall && !isRequireMain) reject()
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'ts' &&
      !allowedTypescriptProperties.has(node.name.text)
    ) {
      reject()
    }

    if (ts.isElementAccessExpression(node)) {
      const isTokenAccess = ts.isIdentifier(node.expression) && node.expression.text === 'tokens'
      const isNodeArgumentAccess =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'node' &&
        node.expression.name.text === 'arguments'
      const isPackageScriptAccess =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'packageJson' &&
        node.expression.name.text === 'scripts' &&
        ts.isStringLiteral(node.argumentExpression)
      if (!isTokenAccess && !isNodeArgumentAccess && !isPackageScriptAccess) reject()
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      !['argv', 'cwd', 'exitCode', 'permission', 'stdout'].includes(node.name.text)
    ) {
      reject()
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  if (
    JSON.stringify(imports.sort()) !== JSON.stringify(['node:fs', 'node:path', 'typescript'].sort())
  ) {
    reject('read-only-policy:forbidden_import')
  }
}

function runContract() {
  const scriptSource = source(files.script)
  const packageJson = JSON.parse(source(files.packageJson))
  const releaseDoc = source(files.releaseDoc)
  const issueDoc = source(files.issueDoc)
  const issue103Script = source(files.issue103Script)
  const issue105Doc = source(files.issue105Doc)
  const issueIndex = source(files.issueIndex)

  assertReadOnlySource(scriptSource)
  assertIncludes(
    packageJson.scripts['qa:issue109:privacy-mailbox'],
    'issue-109-privacy-mailbox-attestation.cjs',
    'package-script',
  )
  assertIncludes(
    packageJson.scripts['qa:issue109:privacy-mailbox'],
    '--permission',
    'package-script',
  )
  for (const readPath of [
    'scripts/qa/issue-109-privacy-mailbox-attestation.cjs',
    'scripts/qa/issue-103-prelaunch-traffic-attestation.cjs',
    'package.json',
    'docs/release/prelaunch-waitlist-readiness.md',
    'docs/issues/ISSUE-109-privacy-mailbox-attestation.md',
    'docs/issues/ISSUE-105-staging-preflight-go-hold.md',
    'docs/issues/README.md',
    'node_modules',
  ]) {
    assertIncludes(
      packageJson.scripts['qa:issue109:privacy-mailbox'],
      `--allow-fs-read=${readPath}`,
      'package-script',
    )
  }
  assertIncludes(
    packageJson.scripts['pr:gate'],
    'pnpm qa:issue109:privacy-mailbox -- --mode=contract',
    'pr-gate',
  )
  assertIncludes(releaseDoc, 'qa:issue109:privacy-mailbox', 'release-doc')
  assertIncludes(releaseDoc, '担当者名、実メール、問い合わせ本文', 'release-doc')
  assertIncludes(releaseDoc, 'prelaunch-mailbox-v1', 'release-doc')
  for (const argument of [
    '--privacy-mailbox-receiving=confirmed',
    '--privacy-mailbox-access-control=confirmed',
    '--privacy-guidance-stop=confirmed',
    '--privacy-registration-deletion=confirmed',
  ]) {
    assertIncludes(releaseDoc, argument, 'release-doc')
  }
  assertIncludes(issueDoc, '未確認項目が 1 つでもあれば HOLD', 'issue-doc')
  for (const checkId of [
    'privacy-mailbox-receiving-confirmed',
    'privacy-mailbox-access-control-confirmed',
    'privacy-guidance-stop-confirmed',
    'privacy-registration-deletion-confirmed',
  ]) {
    assertIncludes(issue103Script, checkId, 'issue-103')
  }
  assertIncludes(issue105Doc, 'ISSUE-109 mailbox attestation が `GO`', 'issue-105')
  assertIncludes(issueIndex, '| `ISSUE-109` | `#237` | `done` |', 'issue-index')

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    evidence_policy:
      'read-only and status-only: no operator identity, email address, message content, request data, or repository path',
    checks: [
      'read-only-ast-allowlist',
      'node-permission-fs-process-runtime',
      'network-ast-denylist',
      'mailbox-receiving-attestation',
      'mailbox-access-control-attestation',
      'guidance-stop-operation-attestation',
      'registration-deletion-operation-attestation',
      'sensitive-input-redaction',
      'hold-by-default',
      'pr-gate-integration',
    ],
  }
}

function runAttestation(values) {
  const checks = attestationArguments.map(({ id, name }) => ({
    id,
    kind: 'human-attestation',
    status: values.get(name) === 'confirmed' ? 'pass' : 'hold',
  }))
  const result = checks.every((check) => check.status === 'pass') ? 'go' : 'hold'

  return {
    issue,
    mode: 'attest',
    scope: attestationScope,
    attestation_version: attestationVersion,
    attested_at: new Date().toISOString(),
    result,
    evidence_policy:
      'status-only: operator identity, email address, message content, and request data are never emitted',
    checks,
  }
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exitCode = exitCode
}

function safeFailureReason(error) {
  if (!(error instanceof Error)) return 'contract_check_failed'
  if (error.message === 'unsupported_mode') return 'unsupported_mode'
  if (
    /^(read-only-policy|package-script|pr-gate|release-doc|issue-doc):(missing_contract|forbidden_operation|forbidden_import)$/.test(
      error.message,
    )
  ) {
    return error.message
  }
  return 'contract_check_failed'
}

function hasRestrictedRuntime() {
  return (
    process.permission?.has('fs.read', join(repoRoot, files.script)) === true &&
    process.permission.has('fs.read', join(repoRoot, '.env')) === false &&
    process.permission.has('fs.write') === false &&
    process.permission.has('child') === false &&
    process.permission.has('worker') === false
  )
}

function main(argv) {
  if (!hasRestrictedRuntime()) {
    emit(
      {
        issue,
        mode: 'restricted-runtime',
        result: 'hold',
        evidence: 'redacted-runtime-policy',
        reason: 'restricted_runtime_required',
      },
      1,
    )
    return
  }

  let parsed
  try {
    parsed = parseArguments(argv)
  } catch {
    emit(
      {
        issue,
        mode: 'invalid',
        result: 'hold',
        evidence: 'redacted-invalid-arguments',
        reason: 'invalid_arguments',
      },
      1,
    )
    return
  }

  try {
    if (parsed.mode === 'contract') {
      emit(runContract())
    } else if (parsed.mode === 'attest') {
      const result = runAttestation(parsed.values)
      emit(result, result.result === 'go' ? 0 : 1)
    } else {
      throw new Error('unsupported_mode')
    }
  } catch (error) {
    emit(
      {
        issue,
        mode: parsed.mode,
        result: 'fail',
        evidence: 'redacted-failure-output',
        reason: safeFailureReason(error),
      },
      1,
    )
  }
}

module.exports = { assertReadOnlySource, parseArguments }

if (require.main === module) main(process.argv.slice(2))
