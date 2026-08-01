import pg from 'pg'
import { E2E_CHILD_ID, E2E_USER_ID } from './constants'
import { assertSyntheticE2eEnvironment } from './environment'

const { Client } = pg

function connectionString() {
  return assertSyntheticE2eEnvironment(process.env).databaseUrl
}

export async function seedSyntheticAccount() {
  const client = new Client({ connectionString: connectionString() })
  await client.connect()
  try {
    await client.query(`DELETE FROM profiles WHERE id = $1`, [E2E_USER_ID])
    await client.query(
      `INSERT INTO profiles (id, display_name, ai_consent_at, updated_at) VALUES ($1, $2, $3, $3)`,
      [E2E_USER_ID, 'synthetic-parent', new Date('2026-07-31T00:00:00Z')],
    )
    await client.query(
      `INSERT INTO children (id, user_id, name, birthdate, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      [E2E_CHILD_ID, E2E_USER_ID, 'はな', '2025-04-01', new Date('2026-07-31T00:00:00Z')],
    )
  } finally {
    await client.end()
  }
}

export async function cleanupSyntheticAccount() {
  const client = new Client({ connectionString: connectionString() })
  await client.connect()
  try {
    await client.query(`DELETE FROM profiles WHERE id = $1`, [E2E_USER_ID])
  } finally {
    await client.end()
  }
}
