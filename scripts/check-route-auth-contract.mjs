#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'
import { extractRouteMethods, routeFileToOpenApiPath } from './check-openapi-route-map.mjs'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
const PUBLIC_ACCESS = new Set(['public', 'optional_session', 'receipt_cookie'])
const PRIVATE_GUARDS = new Set(['requireUser', 'requireAuthenticatedAccount'])
const KNOWN_SESSION_GUARDS = new Set([...PRIVATE_GUARDS, 'getCurrentUser'])
const KNOWN_OWNERSHIP_STRATEGIES = new Set([
  'not_applicable',
  'current_account',
  'current_account_cascade',
  'receipt_hash_match',
  'session_user_filter',
  'session_user_assignment',
  'explicit_owner_check',
  'database_owner_scope',
  'staged_owner_scope',
  'user_scoped_storage_key',
  'reservation_and_image_owner_check',
  'explicit_image_owner_check',
  'user_scoped_delete_filter',
  'child_and_image_owner_check',
  'session_actor_if_present',
  'session_actor',
])
const STRATEGIES_REQUIRING_DENIALS = new Set([
  'explicit_owner_check',
  'reservation_and_image_owner_check',
  'explicit_image_owner_check',
  'user_scoped_delete_filter',
  'child_and_image_owner_check',
])

function singleScheme(security, scheme) {
  return (
    Array.isArray(security) &&
    security.length === 1 &&
    security[0] &&
    typeof security[0] === 'object' &&
    Object.keys(security[0]).length === 1 &&
    Array.isArray(security[0][scheme]) &&
    security[0][scheme].length === 0
  )
}

function isExported(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function normalizeEvidenceText(value) {
  return value.replace(/\s+/g, '')
}

export function collectMethodEvidence(source, method, fileName = 'route.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const localFunctions = new Map()
  let handler

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      localFunctions.set(statement.name.text, statement.body)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          localFunctions.set(declaration.name.text, declaration.initializer.body)
        }
      }
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === method &&
      isExported(statement)
    ) {
      handler = statement.body
      break
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === method) {
          handler = declaration.initializer
          break
        }
      }
    }
    if (handler) break
  }

  const evidence = new Set()
  const visitedHelpers = new Set()
  if (!handler) return evidence

  function visit(node) {
    if (ts.isCallExpression(node)) {
      evidence.add(`call:${normalizeEvidenceText(node.expression.getText(sourceFile))}`)
      if (ts.isIdentifier(node.expression)) {
        const helper = localFunctions.get(node.expression.text)
        if (helper && !visitedHelpers.has(node.expression.text)) {
          visitedHelpers.add(node.expression.text)
          visit(helper)
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      evidence.add(`member:${normalizeEvidenceText(node.getText(sourceFile))}`)
    }
    if (ts.isPropertyAssignment(node)) {
      evidence.add(
        `property:${normalizeEvidenceText(node.name.getText(sourceFile))}=${normalizeEvidenceText(node.initializer.getText(sourceFile))}`,
      )
    }
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      evidence.add(`comparison:${normalizeEvidenceText(node.getText(sourceFile))}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)
  return evidence
}

export function extractOpenApiOperations(openapi) {
  const operations = new Map()
  const paths = openapi?.paths && typeof openapi.paths === 'object' ? openapi.paths : {}
  for (const [route, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object') {
        continue
      }
      operations.set(`${method.toUpperCase()} ${route}`, {
        operation,
        security: operation.security === undefined ? openapi.security : operation.security,
        explicitlyPublic: Array.isArray(operation.security) && operation.security.length === 0,
      })
    }
  }
  return operations
}

export function validateAuthContract(openapi, contract) {
  const errors = []
  const operations = extractOpenApiOperations(openapi)
  const records =
    contract?.operations && typeof contract.operations === 'object' ? contract.operations : {}
  const scheme = contract?.private_security_scheme

  if (contract?.version !== 1) errors.push('contract.version must be 1')
  if (typeof scheme !== 'string' || scheme.length === 0) {
    errors.push('contract.private_security_scheme is required')
  } else if (!singleScheme(openapi?.security, scheme)) {
    errors.push(`OpenAPI root security must require only ${scheme}`)
  }

  for (const key of operations.keys()) {
    if (!(key in records)) errors.push(`${key}: missing from route auth contract`)
  }
  for (const key of Object.keys(records)) {
    if (!operations.has(key)) errors.push(`${key}: not declared in OpenAPI`)
  }

  for (const [key, record] of Object.entries(records)) {
    const located = operations.get(key)
    if (!located || !record || typeof record !== 'object') continue
    const responses = located.operation.responses ?? {}

    if (record.operation_id !== located.operation.operationId) {
      errors.push(`${key}: operation_id does not match OpenAPI`)
    }
    if (typeof record.source !== 'string' || !record.source.endsWith('/route.ts')) {
      errors.push(`${key}: source must point to route.ts`)
    }
    if (!KNOWN_OWNERSHIP_STRATEGIES.has(record.ownership_strategy)) {
      errors.push(`${key}: ownership_strategy is not in the closed vocabulary`)
    }
    if (!Array.isArray(record.ownership_evidence)) {
      errors.push(`${key}: ownership_evidence must be a list`)
    } else if (record.access !== 'public' && record.ownership_evidence.length === 0) {
      errors.push(`${key}: non-public operation requires ownership evidence`)
    }

    if (record.access === 'private') {
      if (!singleScheme(located.security, scheme)) {
        errors.push(`${key}: private operation must require only ${scheme}`)
      }
      if (!PRIVATE_GUARDS.has(record.guard)) {
        errors.push(`${key}: private operation uses an unsupported guard`)
      }
      if (!('401' in responses)) errors.push(`${key}: private operation must declare 401`)
    } else if (PUBLIC_ACCESS.has(record.access)) {
      if (!located.explicitlyPublic) {
        errors.push(`${key}: ${record.access} operation must declare security: []`)
      }
      if (record.access === 'public' && record.guard !== 'none') {
        errors.push(`${key}: public operation guard must be none`)
      }
      if (record.access === 'optional_session' && record.guard !== 'getCurrentUser') {
        errors.push(`${key}: optional_session guard must be getCurrentUser`)
      }
      if (record.access === 'receipt_cookie' && record.guard !== 'cookies') {
        errors.push(`${key}: receipt_cookie guard must be cookies`)
      }
    } else {
      errors.push(`${key}: unknown access policy`)
    }

    if (!Array.isArray(record.ownership_denials)) {
      errors.push(`${key}: ownership_denials must be a list`)
    } else {
      if (
        (STRATEGIES_REQUIRING_DENIALS.has(record.ownership_strategy) || key.includes('{')) &&
        record.ownership_denials.length === 0
      ) {
        errors.push(`${key}: ownership strategy requires at least one denial case`)
      }
      const cases = new Set()
      for (const denial of record.ownership_denials) {
        if (!denial || typeof denial !== 'object' || !/^[a-z][a-z0-9_]*$/.test(denial.case)) {
          errors.push(`${key}: each ownership denial requires a stable snake_case case`)
          continue
        }
        if (cases.has(denial.case)) errors.push(`${key}: duplicate ownership denial case`)
        cases.add(denial.case)
        if (!['403', '404', '422'].includes(String(denial.status))) {
          errors.push(`${key}: ownership denial status must be 403, 404, or 422`)
        } else if (!(String(denial.status) in responses)) {
          errors.push(
            `${key}: ownership denial ${denial.status} is not declared in OpenAPI responses`,
          )
        }
        if (!Array.isArray(denial.evidence) || denial.evidence.length === 0) {
          errors.push(`${key}: ownership denial ${denial.case} requires evidence`)
        }
      }
    }
  }

  return {
    errors,
    operationCount: operations.size,
    privateCount: Object.values(records).filter((record) => record?.access === 'private').length,
  }
}

export function validateRouteSources(contract, cwd = process.cwd()) {
  const errors = []
  const records = contract?.operations ?? {}
  const appRoot = path.resolve(cwd, 'src/app')

  for (const [key, record] of Object.entries(records)) {
    if (!record || typeof record !== 'object' || typeof record.source !== 'string') continue
    const sourcePath = path.resolve(cwd, record.source)
    if (!sourcePath.startsWith(`${path.resolve(cwd)}${path.sep}`) || !existsSync(sourcePath)) {
      errors.push(`${key}: source file is missing`)
      continue
    }

    const [method, declaredRoute] = key.split(' ')
    const actualRoute = routeFileToOpenApiPath(sourcePath, appRoot).replace(/^\/v1/, '')
    if (actualRoute !== declaredRoute) errors.push(`${key}: source route does not match`)

    const source = readFileSync(sourcePath, 'utf8')
    if (!extractRouteMethods(source, sourcePath).has(method)) {
      errors.push(`${key}: source does not export ${method}`)
    }

    const evidence = collectMethodEvidence(source, method, sourcePath)

    if (record.guard === 'none') {
      for (const guard of KNOWN_SESSION_GUARDS) {
        if (evidence.has(`call:${guard}`)) errors.push(`${key}: public source calls ${guard}`)
      }
    } else if (!evidence.has(`call:${record.guard}`)) {
      errors.push(`${key}: source does not call ${record.guard}`)
    }

    for (const expected of record.ownership_evidence ?? []) {
      if (!/^(call|member|property|comparison):\S+$/.test(expected)) {
        errors.push(`${key}: invalid ownership evidence syntax`)
      } else if (!evidence.has(expected)) {
        errors.push(`${key}: source is missing ownership evidence ${expected}`)
      }
    }
    for (const denial of record.ownership_denials ?? []) {
      for (const expected of denial.evidence ?? []) {
        if (!/^(call|member|property|comparison):\S+$/.test(expected)) {
          errors.push(`${key}: invalid denial evidence syntax for ${denial.case}`)
        } else if (!evidence.has(expected)) {
          errors.push(`${key}: source is missing denial evidence ${expected} for ${denial.case}`)
        }
      }
    }
  }

  return errors
}

export function runAuthContractCheck({ openapiPath, contractPath, cwd = process.cwd() }) {
  const openapi = parseYaml(readFileSync(path.resolve(cwd, openapiPath), 'utf8'))
  const contract = parseYaml(readFileSync(path.resolve(cwd, contractPath), 'utf8'))
  const result = validateAuthContract(openapi, contract)
  const errors = [...result.errors, ...validateRouteSources(contract, cwd)]
  const report =
    errors.length === 0
      ? `Route auth contract OK: operations=${result.operationCount}, private=${result.privateCount}`
      : ['Route auth contract drift detected.', ...errors.map((error) => `- ${error}`)].join('\n')
  return { ...result, errors, report }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = runAuthContractCheck({
      openapiPath: 'docs/openapi/openapi.yaml',
      contractPath: 'docs/api-driven-development/route-auth-contract.yaml',
    })
    const log = result.errors.length === 0 ? console.log : console.error
    log(result.report)
    process.exit(result.errors.length === 0 ? 0 : 1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
