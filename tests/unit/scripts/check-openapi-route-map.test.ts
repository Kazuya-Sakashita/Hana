import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/check-openapi-route-map.mjs',
)

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'hana-route-map-'))
  mkdirSync(path.join(root, 'src/app/v1'), { recursive: true })
  return root
}

function writeOpenApi(root: string, pathsYaml: string) {
  writeFileSync(
    path.join(root, 'openapi.yaml'),
    `openapi: 3.1.0
info:
  title: Test API
  version: 0.0.0
servers:
  - url: http://localhost:3000/v1
paths:
${pathsYaml}
`,
  )
}

function writeRoute(root: string, routePath: string, source: string) {
  const dir = path.join(root, 'src/app/v1', routePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'route.ts'), source)
}

function runCheck(root: string) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--openapi', 'openapi.yaml', '--app-root', 'src/app', '--app-dir', 'src/app/v1'],
    { cwd: root, encoding: 'utf8' },
  )
}

describe('check-openapi-route-map', () => {
  it('passes when OpenAPI paths and Route Handler methods match', () => {
    const root = makeFixture()
    writeOpenApi(
      root,
      `  /health:
    get:
      responses:
        '200':
          description: ok
  /children/{childId}:
    get:
      responses:
        '200':
          description: ok
`,
    )
    writeRoute(root, 'health', 'export async function GET() {}')
    writeRoute(root, 'children/[childId]', 'export const GET = async () => new Response()')

    const result = runCheck(root)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('OpenAPI route map OK')
  })

  it('fails when an OpenAPI route is missing from src/app/v1', () => {
    const root = makeFixture()
    writeOpenApi(
      root,
      `  /health:
    get:
      responses:
        '200':
          description: ok
`,
    )

    const result = runCheck(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Missing routes')
    expect(result.stderr).toContain('GET /v1/health')
  })

  it('fails when a route file exports a method not declared in OpenAPI', () => {
    const root = makeFixture()
    writeOpenApi(
      root,
      `  /health:
    get:
      responses:
        '200':
          description: ok
`,
    )
    writeRoute(root, 'health', 'export async function GET() {}\nexport async function POST() {}')

    const result = runCheck(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Extra methods')
    expect(result.stderr).toContain('POST /v1/health')
  })

  it('fails when a route exists but an OpenAPI method is missing from its route file', () => {
    const root = makeFixture()
    writeOpenApi(
      root,
      `  /health:
    get:
      responses:
        '200':
          description: ok
    post:
      responses:
        '204':
          description: ok
`,
    )
    writeRoute(root, 'health', 'export async function GET() {}')

    const result = runCheck(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Missing methods')
    expect(result.stderr).toContain('POST /v1/health')
  })

  it('fails when a Route Handler path is not declared in OpenAPI', () => {
    const root = makeFixture()
    writeOpenApi(
      root,
      `  /health:
    get:
      responses:
        '200':
          description: ok
`,
    )
    writeRoute(root, 'health', 'export async function GET() {}')
    writeRoute(root, 'debug', 'export async function GET() {}')

    const result = runCheck(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Extra routes')
    expect(result.stderr).toContain('GET /v1/debug')
  })
})
