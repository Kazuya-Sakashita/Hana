import pg from 'pg'

const { Client } = pg
const REQUIRED_ROLES = ['anon', 'authenticated']

function assertSafeTarget(connectionString) {
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('local_database_required')
  }
}

async function run() {
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) throw new Error('direct_url_required')
  assertSafeTarget(connectionString)

  const client = new Client({ connectionString })
  try {
    await client.connect()
    for (const role of REQUIRED_ROLES) {
      const existing = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role])
      if (existing.rowCount === 0) {
        await client.query(`CREATE ROLE ${role} NOLOGIN`)
      }
    }
    console.log('ISSUE-123 local PostgreSQL bootstrap: PASS')
  } finally {
    await client.end().catch(() => undefined)
  }
}

run().catch(() => {
  console.error('ISSUE-123 local PostgreSQL bootstrap: FAIL')
  process.exitCode = 1
})
