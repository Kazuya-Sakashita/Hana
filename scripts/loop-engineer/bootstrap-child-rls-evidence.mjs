import pg from 'pg'
import { checkedSyntheticPostgresUrl } from './trusted-synthetic-postgres.mjs'

const { Client } = pg
const roleNames = ['postgres', 'hana_child_runtime']

async function run() {
  const connectionString = checkedSyntheticPostgresUrl(
    process.env.DIRECT_URL,
    'hana_admin',
    'hana-admin',
    process.env.HANA_SYNTHETIC_POSTGRES_PORT,
  )
  const client = new Client({ connectionString })

  try {
    await client.connect()
    const existing = await client.query(
      'SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])',
      [roleNames],
    )
    if (existing.rowCount !== 0) throw new Error('synthetic_roles_must_not_exist')

    await client.query('BEGIN')
    await client.query(`
      CREATE ROLE postgres
        LOGIN PASSWORD 'synthetic-schema-owner'
        NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION BYPASSRLS
    `)
    await client.query(`
      CREATE ROLE hana_child_runtime
        LOGIN PASSWORD 'synthetic-runtime'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    `)
    await client.query('GRANT CONNECT ON DATABASE hana_ci TO postgres, hana_child_runtime')
    await client.query('GRANT USAGE, CREATE ON SCHEMA public TO postgres')
    await client.query('COMMIT')
    process.stdout.write('ISSUE-184 trusted role bootstrap: PASS\n')
  } catch {
    await client.query('ROLLBACK').catch(() => undefined)
    throw new Error('trusted_role_bootstrap_failed')
  } finally {
    await client.end().catch(() => undefined)
  }
}

run().catch(() => {
  process.stderr.write('ISSUE-184 trusted role bootstrap: FAIL\n')
  process.exitCode = 1
})
