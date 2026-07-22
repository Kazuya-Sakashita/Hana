#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

export function parseArgs(args) {
  const out = {
    openapi: 'docs/openapi/openapi.yaml',
    appRoot: 'src/app',
    appDir: 'src/app/v1',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    if (arg === '--openapi' && next) {
      out.openapi = next
      i++
    } else if (arg === '--app-root' && next) {
      out.appRoot = next
      i++
    } else if (arg === '--app-dir' && next) {
      out.appDir = next
      i++
    } else if (arg === '--help') {
      out.help = true
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`)
    }
  }

  return out
}

export function normalizeBasePath(value) {
  if (!value || value === '/') return ''
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function extractServerBasePath(openapi) {
  const servers = Array.isArray(openapi.servers) ? openapi.servers : []
  const basePaths = servers
    .map((server) => server?.url)
    .filter((url) => typeof url === 'string')
    .map((url) => normalizeBasePath(new URL(url, 'http://local.invalid').pathname))

  const unique = [...new Set(basePaths)]
  if (unique.length > 1) {
    throw new Error(`OpenAPI servers use multiple base paths: ${unique.join(', ')}`)
  }
  return unique[0] ?? ''
}

export function extractOpenApiRouteMap(openapi) {
  const basePath = extractServerBasePath(openapi)
  const routeMap = new Map()
  const paths = openapi.paths && typeof openapi.paths === 'object' ? openapi.paths : {}

  for (const [openapiPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const methods = new Set()
    for (const key of Object.keys(pathItem)) {
      const method = key.toLowerCase()
      if (HTTP_METHODS.has(method)) methods.add(method.toUpperCase())
    }
    if (methods.size > 0) {
      routeMap.set(`${basePath}${openapiPath}`, methods)
    }
  }

  return routeMap
}

export function nextSegmentToOpenApi(segment) {
  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/)
  if (optionalCatchAll) return `{${optionalCatchAll[1]}}`

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
  if (catchAll) return `{${catchAll[1]}}`

  const dynamic = segment.match(/^\[(.+)\]$/)
  if (dynamic) return `{${dynamic[1]}}`

  return segment
}

export function routeFileToOpenApiPath(routeFile, appRoot) {
  const relative = path.relative(appRoot, routeFile).split(path.sep).join('/')
  if (!relative.endsWith('/route.ts')) {
    throw new Error(`Route file must end with /route.ts: ${routeFile}`)
  }

  const routeDir = relative.slice(0, -'/route.ts'.length)
  const segments = routeDir
    .split('/')
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .map(nextSegmentToOpenApi)

  return `/${segments.join('/')}`
}

function isExported(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

export function extractRouteMethods(sourceText, fileName = 'route.ts') {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true)
  const methods = new Set()

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isExported(statement) &&
      HTTP_METHODS.has(statement.name.text.toLowerCase())
    ) {
      methods.add(statement.name.text.toUpperCase())
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          HTTP_METHODS.has(declaration.name.text.toLowerCase())
        ) {
          methods.add(declaration.name.text.toUpperCase())
        }
      }
    }
  }

  return methods
}

export function findRouteFiles(rootDir) {
  if (!existsSync(rootDir)) return []

  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        walk(fullPath)
      } else if (entry === 'route.ts') {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files.sort()
}

export function extractNextRouteMap(appDir, appRoot) {
  const routeMap = new Map()
  for (const routeFile of findRouteFiles(appDir)) {
    const routePath = routeFileToOpenApiPath(routeFile, appRoot)
    const methods = extractRouteMethods(readFileSync(routeFile, 'utf8'), routeFile)
    if (methods.size > 0) routeMap.set(routePath, methods)
  }
  return routeMap
}

export function compareRouteMaps(expected, actual) {
  const missingRoutes = []
  const extraRoutes = []
  const missingMethods = []
  const extraMethods = []

  for (const [routePath, expectedMethods] of expected.entries()) {
    const actualMethods = actual.get(routePath)
    if (!actualMethods) {
      missingRoutes.push({ path: routePath, methods: [...expectedMethods].sort() })
      continue
    }
    for (const method of expectedMethods) {
      if (!actualMethods.has(method)) missingMethods.push({ path: routePath, method })
    }
  }

  for (const [routePath, actualMethods] of actual.entries()) {
    const expectedMethods = expected.get(routePath)
    if (!expectedMethods) {
      extraRoutes.push({ path: routePath, methods: [...actualMethods].sort() })
      continue
    }
    for (const method of actualMethods) {
      if (!expectedMethods.has(method)) extraMethods.push({ path: routePath, method })
    }
  }

  return { missingRoutes, extraRoutes, missingMethods, extraMethods }
}

export function hasRouteMapDrift(diff) {
  return (
    diff.missingRoutes.length > 0 ||
    diff.extraRoutes.length > 0 ||
    diff.missingMethods.length > 0 ||
    diff.extraMethods.length > 0
  )
}

export function formatRouteMapReport(diff, counts) {
  if (!hasRouteMapDrift(diff)) {
    return `OpenAPI route map OK: expected=${counts.expectedRoutes}, actual=${counts.actualRoutes}`
  }

  const lines = [
    'OpenAPI route map drift detected.',
    `expected routes=${counts.expectedRoutes}, actual routes=${counts.actualRoutes}`,
  ]

  if (diff.missingRoutes.length > 0) {
    lines.push('', 'Missing routes from src/app/v1:')
    for (const item of diff.missingRoutes) {
      lines.push(`- ${item.methods.join(',')} ${item.path}`)
    }
  }

  if (diff.extraRoutes.length > 0) {
    lines.push('', 'Extra routes not declared in OpenAPI:')
    for (const item of diff.extraRoutes) {
      lines.push(`- ${item.methods.join(',')} ${item.path}`)
    }
  }

  if (diff.missingMethods.length > 0) {
    lines.push('', 'Missing methods from existing route files:')
    for (const item of diff.missingMethods) {
      lines.push(`- ${item.method} ${item.path}`)
    }
  }

  if (diff.extraMethods.length > 0) {
    lines.push('', 'Extra methods not declared in OpenAPI:')
    for (const item of diff.extraMethods) {
      lines.push(`- ${item.method} ${item.path}`)
    }
  }

  return lines.join('\n')
}

function loadOpenApi(openapiPath) {
  return parseYaml(readFileSync(openapiPath, 'utf8'))
}

export function runRouteMapCheck(options, cwd = process.cwd()) {
  const openapiPath = path.resolve(cwd, options.openapi)
  const appRoot = path.resolve(cwd, options.appRoot)
  const appDir = path.resolve(cwd, options.appDir)

  const expected = extractOpenApiRouteMap(loadOpenApi(openapiPath))
  const actual = extractNextRouteMap(appDir, appRoot)
  const diff = compareRouteMaps(expected, actual)
  const report = formatRouteMapReport(diff, {
    expectedRoutes: expected.size,
    actualRoutes: actual.size,
  })

  return { diff, report }
}

function printHelp() {
  console.log(`Usage: node scripts/check-openapi-route-map.mjs [options]

Options:
  --openapi <path>   OpenAPI YAML path (default: docs/openapi/openapi.yaml)
  --app-root <path>  Next app root used for route path mapping (default: src/app)
  --app-dir <path>   Route Handler directory to scan (default: src/app/v1)
`)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const { diff, report } = runRouteMapCheck(options)
    const log = hasRouteMapDrift(diff) ? console.error : console.log
    log(report)
    process.exit(hasRouteMapDrift(diff) ? 1 : 0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
