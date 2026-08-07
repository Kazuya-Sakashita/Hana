import { readFileSync } from 'node:fs'
import type { AnySchema } from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

function readYaml<T>(relativePath: string): T {
  return parseYaml(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T
}

type OpenApiParameter = {
  name?: unknown
  in?: unknown
  required?: unknown
  schema?: AnySchema
}

type OpenApiDocument = {
  paths?: Record<string, { post?: { parameters?: OpenApiParameter[] } }>
}

type ObjectSchema = {
  properties?: Record<string, AnySchema>
}

const webVitalsSchema = readYaml<AnySchema>(
  '../../../docs/openapi/components/schemas/WebVitalsReport.yaml',
)
const productEventSchema = readYaml<AnySchema>(
  '../../../docs/openapi/components/schemas/ProductEventReport.yaml',
)
const appUserSchema = readYaml<ObjectSchema>(
  '../../../docs/openapi/components/schemas/AppUser.yaml',
)
const openApi = readYaml<OpenApiDocument>('../../../docs/openapi/openapi.yaml')

const validateWebVitals = ajv.compile(webVitalsSchema)
const validateProductEvent = ajv.compile(productEventSchema)

function webVitalsReport(operation: string, durationBucket: string) {
  return {
    schema_version: 'hana-web-vitals-report/v2',
    event_id: '00000000-0000-4000-8000-000000000001',
    operation,
    reason: 'not_applicable',
    route_group: 'record',
    status: 'good',
    duration_bucket: durationBucket,
  }
}

function productEventReport(eventName: string, elapsedBucket: string) {
  return {
    event_name: eventName,
    event_id: '019fdc37-4ec0-7000-8000-000000000001',
    flow_id: '123e4567-e89b-42d3-a456-426614174000',
    occurred_minute_utc: '2026-08-07T12:34:00Z',
    elapsed_bucket: elapsedBucket,
  }
}

function operationParameters(path: string): OpenApiParameter[] {
  const parameters = openApi.paths?.[path]?.post?.parameters
  expect(parameters).toBeDefined()
  return parameters ?? []
}

function headerParameter(path: string, name: string): OpenApiParameter {
  const parameter = operationParameters(path).find(
    (candidate) => candidate.in === 'header' && candidate.name === name,
  )
  expect(parameter).toBeDefined()
  return parameter ?? {}
}

function parameterSchema(parameter: OpenApiParameter): AnySchema {
  expect(parameter.schema).toBeDefined()
  return parameter.schema ?? false
}

describe('WebVitalsReport OpenAPI request schema', () => {
  it.each([
    ['web_vital_cls', 'not_applicable'],
    ['web_vital_lcp', 'from_1001_to_2500ms'],
  ])('accepts the route-supported %s / %s combination', (operation, durationBucket) => {
    expect(validateWebVitals(webVitalsReport(operation, durationBucket))).toBe(true)
  })

  it.each([
    ['web_vital_cls', 'under_100ms'],
    ['web_vital_lcp', 'not_applicable'],
  ])('rejects the route-invalid %s / %s combination', (operation, durationBucket) => {
    expect(validateWebVitals(webVitalsReport(operation, durationBucket))).toBe(false)
  })
})

describe('ProductEventReport OpenAPI request schema', () => {
  const durationlessEvents = ['record_started', 'memory_viewed'] as const
  const timedEvents = ['photo_selected', 'ai_draft_shown', 'memory_saved'] as const
  const timedBuckets = ['under_10s', 'from_10_to_30s', 'from_31_to_60s', 'over_60s'] as const

  it.each(durationlessEvents)('accepts not_applicable for %s', (eventName) => {
    expect(validateProductEvent(productEventReport(eventName, 'not_applicable'))).toBe(true)
  })

  it.each(timedEvents.flatMap((eventName) => timedBuckets.map((bucket) => [eventName, bucket])))(
    'accepts %s with timed bucket %s',
    (eventName, bucket) => {
      expect(validateProductEvent(productEventReport(eventName, bucket))).toBe(true)
    },
  )

  it.each(
    durationlessEvents.flatMap((eventName) => timedBuckets.map((bucket) => [eventName, bucket])),
  )('rejects durationless event %s with timed bucket %s', (eventName, bucket) => {
    expect(validateProductEvent(productEventReport(eventName, bucket))).toBe(false)
  })

  it.each(timedEvents)('rejects timed event %s with not_applicable', (eventName) => {
    expect(validateProductEvent(productEventReport(eventName, 'not_applicable'))).toBe(false)
  })
})

describe('/metrics/vitals OpenAPI header contract', () => {
  const origin = headerParameter('/metrics/vitals', 'Origin')
  const fetchSite = headerParameter('/metrics/vitals', 'Sec-Fetch-Site')
  const originSchema = parameterSchema(origin)
  const fetchSiteSchema = parameterSchema(fetchSite)
  const validateHeaders = ajv.compile({
    type: 'object',
    required: ['Origin', 'Sec-Fetch-Site'],
    properties: {
      Origin: originSchema,
      'Sec-Fetch-Site': fetchSiteSchema,
    },
  })

  it('requires both browser boundary headers', () => {
    expect(origin.required).toBe(true)
    expect(fetchSite.required).toBe(true)
    expect(
      validateHeaders({ Origin: 'http://localhost:3000', 'Sec-Fetch-Site': 'same-origin' }),
    ).toBe(true)
    expect(validateHeaders({ 'Sec-Fetch-Site': 'same-origin' })).toBe(false)
    expect(validateHeaders({ Origin: 'http://localhost:3000' })).toBe(false)
  })

  it('allows only same-origin Fetch Metadata', () => {
    expect(fetchSiteSchema).toMatchObject({ type: 'string', const: 'same-origin' })
    expect(
      validateHeaders({ Origin: 'http://localhost:3000', 'Sec-Fetch-Site': 'cross-site' }),
    ).toBe(false)
  })
})

describe('ProductEvent telemetry binding OpenAPI schema', () => {
  const responseBindingSchema = appUserSchema.properties?.telemetry_binding ?? false
  const requestBinding = headerParameter('/metrics/events', 'X-Hana-Telemetry-Binding')
  const requestBindingSchema = parameterSchema(requestBinding)
  const bindingSchemaShape = {
    type: 'string',
    pattern: '^v3\\.\\d{10}\\.[0-9a-f]{64}\\.[0-9a-f]{64}$',
  }
  const validBinding = `v3.1786057200.${'a'.repeat(64)}.${'b'.repeat(64)}`

  it('keeps the AppUser response and request header on the same required v3 pattern', () => {
    expect(responseBindingSchema).not.toBe(false)
    expect(requestBinding.required).toBe(true)
    expect(responseBindingSchema).toMatchObject(bindingSchemaShape)
    expect(requestBindingSchema).toMatchObject(bindingSchemaShape)
    expect(ajv.compile(responseBindingSchema)(validBinding)).toBe(true)
    expect(ajv.compile(requestBindingSchema)(validBinding)).toBe(true)
  })

  it.each([
    `v2.1786057200.${'a'.repeat(64)}`,
    `v3.178605720.${'a'.repeat(64)}.${'b'.repeat(64)}`,
    `v3.1786057200.${'a'.repeat(63)}.${'b'.repeat(64)}`,
    `v3.1786057200.${'a'.repeat(64)}.${'g'.repeat(64)}`,
  ])('rejects malformed or legacy binding %s', (binding) => {
    expect(ajv.compile(responseBindingSchema)(binding)).toBe(false)
    expect(ajv.compile(requestBindingSchema)(binding)).toBe(false)
  })
})
