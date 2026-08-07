import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

const schema = parseYaml(
  readFileSync(
    new URL('../../../docs/openapi/components/schemas/WebVitalsReport.yaml', import.meta.url),
    'utf8',
  ),
)
const validate = ajv.compile(schema)

function report(operation: string, durationBucket: string) {
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

describe('WebVitalsReport OpenAPI request schema', () => {
  it.each([
    ['web_vital_cls', 'not_applicable'],
    ['web_vital_lcp', 'from_1001_to_2500ms'],
  ])('accepts the route-supported %s / %s combination', (operation, durationBucket) => {
    expect(validate(report(operation, durationBucket))).toBe(true)
  })

  it.each([
    ['web_vital_cls', 'under_100ms'],
    ['web_vital_lcp', 'not_applicable'],
  ])('rejects the route-invalid %s / %s combination', (operation, durationBucket) => {
    expect(validate(report(operation, durationBucket))).toBe(false)
  })
})
