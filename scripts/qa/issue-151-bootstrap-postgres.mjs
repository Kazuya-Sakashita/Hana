import pg from 'pg'

const { Client } = pg
const ROLE_NAMES = ['hana_migrator', 'hana_child_runtime']

function assertSafeTarget(connectionString) {
  if (process.env.ISSUE_151_DATABASE_QA !== '1') {
    throw new Error('issue_151_database_qa_opt_in_required')
  }
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hana_ci') {
    throw new Error('local_hana_ci_database_required')
  }
}

async function run() {
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) throw new Error('direct_url_required')
  assertSafeTarget(connectionString)

  const client = new Client({ connectionString })
  try {
    await client.connect()
    const existing = await client.query(
      'SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])',
      [ROLE_NAMES],
    )
    if (existing.rowCount !== 0) throw new Error('issue_151_roles_must_not_exist')

    await client.query('BEGIN')
    await client.query(`
      CREATE ROLE hana_migrator
        LOGIN PASSWORD 'synthetic-migrator'
        NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION BYPASSRLS
    `)
    await client.query(`
      CREATE ROLE hana_child_runtime
        LOGIN PASSWORD 'synthetic-runtime'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    `)
    await client.query('GRANT CONNECT ON DATABASE hana_ci TO hana_migrator, hana_child_runtime')
    await client.query('GRANT USAGE, CREATE ON SCHEMA public TO hana_migrator')
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
