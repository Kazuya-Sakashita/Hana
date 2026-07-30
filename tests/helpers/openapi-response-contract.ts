import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

type Schema = {
  $ref?: string
  type?: string | string[]
  required?: string[]
  properties?: Record<string, Schema>
  items?: Schema
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}

type Located<T> = { value: T; file: string }

const rootFile = path.resolve(process.cwd(), 'docs/openapi/openapi.yaml')
const documentCache = new Map<string, unknown>()

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

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function validateSchema(locatedSchema: Located<Schema>, value: unknown, pointer: string): string[] {
  const { value: schema, file } = dereference(locatedSchema)
  const errors: string[] = []
  const allowedTypes = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : []
  const actualType = valueType(value)

  if (allowedTypes.length > 0 && !allowedTypes.includes(actualType)) {
    return [`${pointer}: expected ${allowedTypes.join('|')}, received ${actualType}`]
  }

  if (actualType === 'object') {
    const object = value as Record<string, unknown>
    for (const required of schema.required ?? []) {
      if (!(required in object)) errors.push(`${pointer}.${required}: required property missing`)
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in object) {
        errors.push(
          ...validateSchema({ value: propertySchema, file }, object[key], `${pointer}.${key}`),
        )
      }
    }
  }

  if (actualType === 'array' && schema.items) {
    for (const [index, item] of (value as unknown[]).entries()) {
      errors.push(...validateSchema({ value: schema.items, file }, item, `${pointer}[${index}]`))
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer}: shorter than minLength ${schema.minLength}`)
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${pointer}: longer than maxLength ${schema.maxLength}`)
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer}: does not match pattern ${schema.pattern}`)
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${pointer}: below minimum ${schema.minimum}`)
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${pointer}: above maximum ${schema.maximum}`)
    }
  }

  return errors
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
  const errors = validateSchema({ value: media.schema, file: locatedResponse.file }, body, '$')
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
