import pg from 'pg'
import { checkedSyntheticPostgresConfig } from './synthetic-postgres-target.mjs'

const { Client } = pg
const REQUIRED_ROLES = ['anon', 'authenticated']

async function run() {
  const connectionString = process.env.DIRECT_URL
  const connectionConfig = checkedSyntheticPostgresConfig(connectionString, 'DIRECT_URL')

  const client = new Client(connectionConfig)
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
