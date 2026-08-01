import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg
const LOCK_PREFIX = 'hana:ai-consent:'

function assertSafeTarget(connectionString) {
  if (process.env.ISSUE_138_DATABASE_QA !== '1') throw new Error('qa_opt_in_required')
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('local_database_required')
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function begin(client) {
  await client.query('BEGIN')
  await client.query(`SET LOCAL statement_timeout = '45s'`)
  await client.query(`SET LOCAL lock_timeout = '42s'`)
}

async function lockConsent(client, userId) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${LOCK_PREFIX}${userId}`,
  ])
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('database_url_required')
  assertSafeTarget(connectionString)

  const setup = new Client({ connectionString })
  const generation = new Client({ connectionString })
  const revocation = new Client({ connectionString })
  const independent = new Client({ connectionString })
  const userId = randomUUID()
  const otherUserId = randomUUID()
  const consentAt = new Date('2026-07-31T00:00:00Z')

  try {
    await Promise.all([
      setup.connect(),
      generation.connect(),
      revocation.connect(),
      independent.connect(),
    ])
    await setup.query(
      `INSERT INTO profiles (id, ai_consent_at, updated_at) VALUES ($1, $3, NOW()), ($2, $3, NOW())`,
      [userId, otherUserId, consentAt],
    )

    await begin(generation)
    await lockConsent(generation, userId)
    let revocationSettled = false
    const waitStartedAt = Date.now()
    const waitingRevocation = (async () => {
      await begin(revocation)
      await lockConsent(revocation, userId)
      await revocation.query(`UPDATE profiles SET ai_consent_at = NULL WHERE id = $1`, [userId])
      await revocation.query('COMMIT')
    })().finally(() => {
      revocationSettled = true
    })

    await delay(5_100)
    if (revocationSettled) throw new Error('revocation_did_not_wait_for_generation')

    await begin(independent)
    const independentStartedAt = Date.now()
    await lockConsent(independent, otherUserId)
    if (Date.now() - independentStartedAt > 1_000) throw new Error('other_user_waited_for_lock')
    await independent.query('ROLLBACK')

    await generation.query('COMMIT')
    await waitingRevocation
    if (Date.now() - waitStartedAt < 5_000) throw new Error('five_second_boundary_not_exercised')

    const revoked = await setup.query(`SELECT ai_consent_at FROM profiles WHERE id = $1`, [userId])
    if (revoked.rows[0]?.ai_consent_at !== null) throw new Error('revocation_did_not_commit')

    await setup.query(`UPDATE profiles SET ai_consent_at = $2 WHERE id = $1`, [userId, consentAt])
    await begin(revocation)
    await lockConsent(revocation, userId)
    await revocation.query(`UPDATE profiles SET ai_consent_at = NULL WHERE id = $1`, [userId])
    await revocation.query('COMMIT')

    await begin(generation)
    await lockConsent(generation, userId)
    const serializedConsent = await generation.query(
      `SELECT ai_consent_at FROM profiles WHERE id = $1`,
      [userId],
    )
    await generation.query('ROLLBACK')
    let vendorCalls = 0
    if (serializedConsent.rows[0]?.ai_consent_at !== null) vendorCalls += 1
    if (vendorCalls !== 0) throw new Error('vendor_called_after_revocation_commit')

    console.info('ISSUE-138 database concurrency QA passed')
  } finally {
    for (const client of [generation, revocation, independent]) {
      try {
        await client.query('ROLLBACK')
      } catch {}
    }
    try {
      await setup.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [[userId, otherUserId]])
    } catch {}
    await Promise.allSettled([setup.end(), generation.end(), revocation.end(), independent.end()])
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unknown_error')
  process.exitCode = 1
})
