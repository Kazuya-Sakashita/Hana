import { describe, expect, it } from 'vitest'
import { assertSyntheticE2eEnvironment } from '../../e2e/support/environment'

const safeEnvironment = {
  HANA_SYNTHETIC_E2E: '1',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/hana_ci',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/hana_ci',
}

describe('synthetic E2E environment guard', () => {
  it('accepts an explicit local hana_ci target', () => {
    expect(assertSyntheticE2eEnvironment(safeEnvironment)).toMatchObject({
      databaseUrl: expect.stringContaining('/hana_ci'),
    })
  })

  it.each([
    ['missing opt-in', { ...safeEnvironment, HANA_SYNTHETIC_E2E: '0' }],
    [
      'external database',
      { ...safeEnvironment, DATABASE_URL: 'postgresql://postgres:postgres@db.example/hana_ci' },
    ],
    [
      'localhost development database',
      { ...safeEnvironment, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/hana' },
    ],
    [
      'different direct target',
      {
        ...safeEnvironment,
        DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/hana_ci',
      },
    ],
  ])('rejects %s before seed', (_name, environment) => {
    expect(() => assertSyntheticE2eEnvironment(environment)).toThrow()
  })
})
