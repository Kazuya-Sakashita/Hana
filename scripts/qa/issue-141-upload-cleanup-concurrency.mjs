import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg
const LOCK_PREFIX = 'hana:upload-storage:'

function assertSafeTarget(connectionString) {
  if (process.env.ISSUE_141_DATABASE_QA !== '1') throw new Error('qa_opt_in_required')
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hana_ci') {
    throw new Error('synthetic_local_database_required')
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function lock(client, key) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${LOCK_PREFIX}${key}`,
  ])
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('database_url_required')
  assertSafeTarget(connectionString)

  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const userId = randomUUID()
  const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
  const confirmKey = `uploads/${userHash}/202607/${randomUUID()}.jpg`
  const cleanupKey = `uploads/${userHash}/202607/${randomUUID()}.jpg`
  const independentKey = `uploads/${userHash}/202607/${randomUUID()}.jpg`
  const now = new Date()

  try {
    await Promise.all([setup.connect(), first.connect(), second.connect()])
    await setup.query(`INSERT INTO profiles (id, updated_at) VALUES ($1, $2)`, [userId, now])
    await setup.query(
      `INSERT INTO upload_reservations
         (id, user_id, storage_key, issued_at, signed_url_expires_at, cleanup_after, next_attempt_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $4, $4, $4, $4),
         ($5, $2, $6, $4, $4, $4, $4, $4)`,
      [randomUUID(), userId, confirmKey, now, randomUUID(), cleanupKey],
    )

    await first.query('BEGIN')
    await lock(first, confirmKey)
    await first.query(
      `INSERT INTO images
         (id, user_id, storage_key, content_type, width, height, file_size, updated_at)
       VALUES ($1, $2, $3, 'image/jpeg', 1, 1, 1, $4)`,
      [randomUUID(), userId, confirmKey, now],
    )
    let cleanupSettled = false
    const waitingCleanup = (async () => {
      await second.query('BEGIN')
      await lock(second, confirmKey)
      const image = await second.query(`SELECT id FROM images WHERE storage_key = $1`, [confirmKey])
      await second.query('ROLLBACK')
      return image.rowCount
    })().finally(() => {
      cleanupSettled = true
    })
    await delay(150)
    if (cleanupSettled) throw new Error('cleanup_did_not_wait_for_confirm')
    await first.query('COMMIT')
    if ((await waitingCleanup) !== 1) throw new Error('cleanup_did_not_protect_confirmed_image')

    await first.query('BEGIN')
    await lock(first, cleanupKey)
    await first.query(`DELETE FROM upload_reservations WHERE storage_key = $1`, [cleanupKey])
    let confirmSettled = false
    const waitingConfirm = (async () => {
      await second.query('BEGIN')
      await lock(second, cleanupKey)
      const reservation = await second.query(
        `SELECT id FROM upload_reservations WHERE storage_key = $1`,
        [cleanupKey],
      )
      await second.query('ROLLBACK')
      return reservation.rowCount
    })().finally(() => {
      confirmSettled = true
    })
    await delay(150)
    if (confirmSettled) throw new Error('confirm_did_not_wait_for_cleanup')

    await setup.query('BEGIN')
    await lock(setup, independentKey)
    await setup.query('ROLLBACK')

    await first.query('COMMIT')
    if ((await waitingConfirm) !== 0) throw new Error('cleanup_state_was_not_visible_to_confirm')

    await first.query('BEGIN')
    await lock(first, confirmKey)
    await second.query('BEGIN')
    await second.query(`SET LOCAL statement_timeout = '100ms'`)
    let timedOutSafely = false
    try {
      await lock(second, confirmKey)
    } catch (error) {
      timedOutSafely = error && typeof error === 'object' && error.code === '57014'
    }
    await second.query('ROLLBACK')
    await first.query('ROLLBACK')
    if (!timedOutSafely) throw new Error('lock_timeout_did_not_fail_safely')

    await first.query('BEGIN')
    await first.query(
      `UPDATE profiles
       SET access_blocked_at = CURRENT_TIMESTAMP, deletion_requested_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId],
    )
    let cleanupProfileCheckSettled = false
    const waitingProfileCheck = (async () => {
      await second.query('BEGIN')
      const active = await second.query(
        `SELECT id
         FROM profiles
         WHERE id = $1
           AND access_blocked_at IS NULL
           AND deletion_requested_at IS NULL
         FOR UPDATE`,
        [userId],
      )
      await second.query('ROLLBACK')
      return active.rowCount
    })().finally(() => {
      cleanupProfileCheckSettled = true
    })
    await delay(150)
    if (cleanupProfileCheckSettled) throw new Error('profile_check_did_not_wait_for_deletion')
    await first.query('COMMIT')
    if ((await waitingProfileCheck) !== 0)
      throw new Error('blocked_profile_remained_cleanup_eligible')

    await setup.query(
      `UPDATE profiles SET access_blocked_at = NULL, deletion_requested_at = NULL WHERE id = $1`,
      [userId],
    )
    await first.query('BEGIN')
    const active = await first.query(
      `SELECT id
       FROM profiles
       WHERE id = $1
         AND access_blocked_at IS NULL
         AND deletion_requested_at IS NULL
       FOR UPDATE`,
      [userId],
    )
    if (active.rowCount !== 1) throw new Error('active_profile_lock_failed')
    let deletionSettled = false
    const waitingDeletion = second
      .query(
        `UPDATE profiles
         SET access_blocked_at = CURRENT_TIMESTAMP, deletion_requested_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId],
      )
      .finally(() => {
        deletionSettled = true
      })
    await delay(150)
    if (deletionSettled) throw new Error('deletion_did_not_wait_for_profile_lock')
    await first.query('COMMIT')
    await waitingDeletion

    process.stdout.write(
      `${JSON.stringify({ confirmFirst: 'pass', cleanupFirst: 'pass', independentKey: 'pass', timeout: 'pass', deletionFirst: 'pass', cleanupProfileFirst: 'pass' })}\n`,
    )
  } finally {
    await setup.query(`DELETE FROM profiles WHERE id = $1`, [userId]).catch(() => undefined)
    await Promise.allSettled([setup.end(), first.end(), second.end()])
  }
}

run().catch(() => {
  process.stderr.write('issue-141 synthetic concurrency QA failed\n')
  process.exitCode = 1
})
