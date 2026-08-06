import { readFileSync } from 'node:fs'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { checkedSyntheticPostgresConfig } from '../../../scripts/qa/synthetic-postgres-target.mjs'

describe('synthetic PostgreSQL target', () => {
  it('returns an explicit client config for one loopback hana_ci authority', () => {
    expect(
      checkedSyntheticPostgresConfig(
        'postgresql://synthetic_user:synthetic-password@127.0.0.1:55451/hana_ci',
        'DIRECT_URL',
      ),
    ).toEqual({
      host: '127.0.0.1',
      port: 55451,
      database: 'hana_ci',
      user: 'synthetic_user',
      password: 'synthetic-password',
    })
  })

  it('keeps role-mutating bootstraps on the validated explicit config', () => {
    for (const file of [
      'scripts/qa/issue-123-bootstrap-postgres.mjs',
      'scripts/qa/issue-151-bootstrap-postgres.mjs',
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('checkedSyntheticPostgresConfig')
      expect(source).toContain('new Client(connectionConfig)')
      expect(source).not.toContain('new Client({ connectionString })')
    }
  })

  it('does not fall back to poisoned libpq identity environment variables', () => {
    const previous = {
      PGPORT: process.env.PGPORT,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
    }
    process.env.PGPORT = '6543'
    process.env.PGUSER = 'unexpected_user'
    process.env.PGPASSWORD = 'unexpected-password'
    try {
      const config = checkedSyntheticPostgresConfig(
        'postgresql://synthetic_user:synthetic-password@127.0.0.1:55451/hana_ci',
        'DIRECT_URL',
      )
      const client = new pg.Client(config)
      const connectionParameters = (
        client as unknown as {
          connectionParameters: {
            host: string
            port: number
            database: string
            user: string
            password: string
          }
        }
      ).connectionParameters
      expect(connectionParameters).toMatchObject({
        host: '127.0.0.1',
        port: 55451,
        database: 'hana_ci',
        user: 'synthetic_user',
        password: 'synthetic-password',
      })
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })

  it.each([
    '?host=db.example.com',
    '?port=6543',
    '?host=%2Fvar%2Frun%2Fpostgresql',
    '?dbname=production',
    '#host=db.example.com',
  ])('rejects connection option override %s', (suffix) => {
    expect(() =>
      checkedSyntheticPostgresConfig(
        `postgresql://synthetic_user:synthetic-password@127.0.0.1:55451/hana_ci${suffix}`,
        'DIRECT_URL',
      ),
    ).toThrow('direct_url_connection_options_not_allowed')
  })

  it.each([
    'postgresql://synthetic_user:synthetic-password@db.example.com:5432/hana_ci',
    'postgresql://synthetic_user:synthetic-password@127.0.0.1:55451/production',
    'https://synthetic_user:synthetic-password@127.0.0.1:55451/hana_ci',
  ])('rejects non-synthetic target %s', (connectionString) => {
    expect(() => checkedSyntheticPostgresConfig(connectionString, 'DIRECT_URL')).toThrow()
  })

  it.each([
    'postgresql://synthetic_user:synthetic-password@127.0.0.1:0/hana_ci',
    'postgresql://:synthetic-password@127.0.0.1:55451/hana_ci',
    'postgresql://synthetic_user@127.0.0.1:55451/hana_ci',
  ])('rejects a falsy identity field %s', (connectionString) => {
    expect(() => checkedSyntheticPostgresConfig(connectionString, 'DIRECT_URL')).toThrow()
  })
})
