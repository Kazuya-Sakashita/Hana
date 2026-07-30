import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { AnySchema, ErrorObject } from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'

type Schema = Record<string, unknown>

type Located<T> = { value: T; file: string }

const rootFile = path.resolve(process.cwd(), 'docs/openapi/openapi.yaml')
const documentCache = new Map<string, unknown>()
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

function loadDocument(file: string): unknown {
  const resolved = path.resolve(file)
  const cached = documentCache.get(resolved)
  if (cached) return cached
  const parsed = parseYaml(readFileSync(resolved, 'utf8')) as unknown
  documentCache.set(resolved, parsed)
  return parsed
}

function readPointer(document: unknown, fragment: string): unknown {
  if (!fragment || fragment === '#') return document
  return fragment
    .replace(/^#\//, '')
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object' || !(part in current)) {
        throw new Error(`OpenAPI reference fragment not found: ${fragment}`)
      }
      return (current as Record<string, unknown>)[part]
    }, document)
}

function resolveRef<T>(ref: string, fromFile: string): Located<T> {
  const [filePart, fragment = ''] = ref.split('#')
  const file = filePart ? path.resolve(path.dirname(fromFile), filePart) : fromFile
  return { value: readPointer(loadDocument(file), `#${fragment}`) as T, file }
}

function dereference<T extends { $ref?: string }>(located: Located<T>): Located<T> {
  let current = located
  const seen = new Set<string>()
  while (current.value.$ref) {
    const key = `${current.file}:${current.value.$ref}`
    if (seen.has(key)) throw new Error(`Circular OpenAPI reference: ${key}`)
    seen.add(key)
    current = resolveRef<T>(current.value.$ref, current.file)
  }
  return current
}

function resolveSchema(located: Located<unknown>, stack = new Set<string>()): unknown {
  if (Array.isArray(located.value)) {
    return located.value.map((value) => resolveSchema({ value, file: located.file }, stack))
  }
  if (!located.value || typeof located.value !== 'object') return located.value

  const schema = located.value as Record<string, unknown>
  if (typeof schema.$ref === 'string') {
    const key = `${located.file}:${schema.$ref}`
    if (stack.has(key)) throw new Error(`Circular OpenAPI reference: ${key}`)
    const nextStack = new Set(stack).add(key)
    const resolved = resolveRef<Schema>(schema.$ref, located.file)
    const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'))
    return {
      ...(resolveSchema(resolved, nextStack) as Record<string, unknown>),
      ...(resolveSchema({ value: siblings, file: located.file }, nextStack) as Record<
        string,
        unknown
      >),
    }
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      resolveSchema({ value, file: located.file }, stack),
    ]),
  )
}

function formatSchemaErrors(errors: ErrorObject[]): string[] {
  return errors.map((error) => {
    const pointer = error.instancePath || '$'
    return `${pointer}: ${error.message ?? error.keyword}`
  })
}

export async function assertOpenApiResponse({
  method,
  route,
  response,
}: {
  method: string
  route: string
  response: Response
}) {
  const root = loadDocument(rootFile) as {
    paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>
  }
  const operation = root.paths?.[route]?.[method.toLowerCase()]
  if (!operation)
    throw new Error(`OpenAPI operation not declared: ${method.toUpperCase()} ${route}`)

  const declaredResponse = operation.responses?.[String(response.status)] as
    | {
        $ref?: string
        content?: Record<string, { schema?: Schema }>
      }
    | undefined
  if (!declaredResponse) {
    throw new Error(
      `OpenAPI response status not declared: ${method.toUpperCase()} ${route} ${response.status}`,
    )
  }
  const locatedResponse = dereference({
    value: declaredResponse as {
      $ref?: string
      content?: Record<string, { schema?: Schema }>
    },
    file: rootFile,
  })

  const contentType = response.headers.get('Content-Type')?.split(';')[0]
  if (!contentType) throw new Error('Response Content-Type is missing')
  const media = locatedResponse.value.content?.[contentType]
  if (!media) {
    throw new Error(
      `OpenAPI Content-Type not declared: ${method.toUpperCase()} ${route} ${response.status} ${contentType}`,
    )
  }
  if (!media.schema) return

  const body = await response.clone().json()
  const validate = ajv.compile(
    resolveSchema({ value: media.schema, file: locatedResponse.file }) as AnySchema,
  )
  const valid = validate(body)
  const errors = valid ? [] : formatSchemaErrors(validate.errors ?? [])
  if (contentType === 'application/problem+json' && body.status !== response.status) {
    errors.push(
      `$.status: expected HTTP status ${response.status}, received ${String(body.status)}`,
    )
  }
  if (errors.length > 0) {
    throw new Error(
      `OpenAPI response schema mismatch: ${method.toUpperCase()} ${route} ${response.status}\n${errors.join('\n')}`,
    )
  }
}
