import pg from 'pg'
import { checkedSyntheticPostgresConfig } from './synthetic-postgres-target.mjs'

const { Client } = pg
const ROLE_NAMES = ['postgres', 'hana_child_runtime']

async function run() {
  const connectionString = process.env.DIRECT_URL
  if (process.env.ISSUE_151_DATABASE_QA !== '1') {
    throw new Error('issue_151_database_qa_opt_in_required')
  }
  const connectionConfig = checkedSyntheticPostgresConfig(connectionString, 'DIRECT_URL')

  const client = new Client(connectionConfig)
  try {
    await client.connect()
    const existing = await client.query(
      'SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])',
      [ROLE_NAMES],
    )
    if (existing.rowCount !== 0) throw new Error('issue_151_roles_must_not_exist')

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
    console.log('ISSUE-151 synthetic PostgreSQL role bootstrap: PASS')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }
}

run().catch(() => {
  console.error('ISSUE-151 synthetic PostgreSQL role bootstrap: FAIL')
  process.exitCode = 1
})
