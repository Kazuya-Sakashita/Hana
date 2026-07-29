import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg
const LOCK_PREFIX = 'hana:image:'

function assertSafeTarget(connectionString) {
  if (process.env.ISSUE_123_DATABASE_QA !== '1') {
    throw new Error('qa_opt_in_required')
  }

  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('local_database_required')
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('database_url_required')
  assertSafeTarget(connectionString)

  const setup = new Client({ connectionString })
  const deletion = new Client({ connectionString })
  const access = new Client({ connectionString })

  const userId = randomUUID()
  const childId = randomUUID()
  const targetMemoryId = randomUUID()
  const otherMemoryId = randomUUID()
  const rollbackMemoryId = randomUUID()
  const targetImageId = randomUUID()
  const unlinkedImageId = randomUUID()
  const otherImageId = randomUUID()
  const rollbackImageId = randomUUID()
  const now = new Date()

  try {
    await Promise.all([setup.connect(), deletion.connect(), access.connect()])
    await setup.query(
      `INSERT INTO profiles (id, updated_at)
       VALUES ($1, $2)`,
      [userId, now],
    )
    await setup.query(
      `INSERT INTO children (id, user_id, name, birthdate, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [childId, userId, 'QA', '2026-01-01', now],
    )
    await setup.query(
      `INSERT INTO memories
         (id, user_id, child_id, title, recorded_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6),
         ($7, $2, $3, $4, $5, $6),
         ($8, $2, $3, $4, $5, $6)`,
      [targetMemoryId, userId, childId, 'QA', '2026-07-29', now, otherMemoryId, rollbackMemoryId],
    )
    await setup.query(
      `INSERT INTO images
         (id, user_id, memory_id, storage_key, content_type, width, height, file_size, updated_at)
       VALUES
         ($1, $2, $3, $4, 'image/jpeg', 1, 1, 1, $5),
         ($6, $2, NULL, $7, 'image/jpeg', 1, 1, 1, $5),
         ($8, $2, $9, $10, 'image/jpeg', 1, 1, 1, $5),
         ($11, $2, $12, $13, 'image/jpeg', 1, 1, 1, $5)`,
      [
        targetImageId,
        userId,
        targetMemoryId,
        randomUUID(),
        now,
        unlinkedImageId,
        randomUUID(),
        otherImageId,
        otherMemoryId,
        randomUUID(),
        rollbackImageId,
        rollbackMemoryId,
        randomUUID(),
      ],
    )

    await deletion.query('BEGIN')
    await deletion.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${LOCK_PREFIX}${targetImageId}`,
    ])
    const deletedAt = new Date()
    await deletion.query(
      `UPDATE memories
       SET deleted_at = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [deletedAt, targetMemoryId, userId],
    )
    await deletion.query(
      `UPDATE images
       SET deleted_at = $1
       WHERE memory_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [deletedAt, targetMemoryId, userId],
    )

    let accessSettled = false
    const accessAttempt = (async () => {
      await access.query('BEGIN')
      await access.query(`SET LOCAL statement_timeout = '5s'`)
      await access.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${LOCK_PREFIX}${targetImageId}`,
      ])
      const result = await access.query(
        `SELECT images.id
         FROM images
         LEFT JOIN memories ON memories.id = images.memory_id
         WHERE images.id = $1
           AND images.user_id = $2
           AND images.deleted_at IS NULL
           AND (
             images.memory_id IS NULL
             OR (memories.user_id = $2 AND memories.deleted_at IS NULL)
           )`,
        [targetImageId, userId],
      )
      return result.rowCount
    })().finally(() => {
      accessSettled = true
    })

    await delay(150)
    if (accessSettled) throw new Error('access_did_not_wait_for_lock')

    await deletion.query('COMMIT')
    const accessibleRows = await accessAttempt
    await access.query('ROLLBACK')
    if (accessibleRows !== 0) throw new Error('deleted_image_remained_accessible')

    const state = await setup.query(
      `SELECT
         (SELECT deleted_at FROM memories WHERE id = $1) AS memory_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $2) AS image_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $3) AS unlinked_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $4) AS other_deleted_at`,
      [targetMemoryId, targetImageId, unlinkedImageId, otherImageId],
    )
    const row = state.rows[0]
    if (
      !(row?.memory_deleted_at instanceof Date) ||
      !(row?.image_deleted_at instanceof Date) ||
      row.memory_deleted_at.getTime() !== row.image_deleted_at.getTime()
    ) {
      throw new Error('deletion_timestamp_mismatch')
    }
    if (row.unlinked_deleted_at !== null || row.other_deleted_at !== null) {
      throw new Error('unrelated_image_was_deleted')
    }

    await access.query('BEGIN')
    await access.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${LOCK_PREFIX}${otherImageId}`,
    ])
    let deletionSettled = false
    const waitingDeletion = (async () => {
      await deletion.query('BEGIN')
      await deletion.query(`SET LOCAL statement_timeout = '35s'`)
      await deletion.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${LOCK_PREFIX}${otherImageId}`,
      ])
      const waitingDeletedAt = new Date()
      await deletion.query(
        `UPDATE memories
         SET deleted_at = $1
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [waitingDeletedAt, otherMemoryId, userId],
      )
      await deletion.query(
        `UPDATE images
         SET deleted_at = $1
         WHERE memory_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [waitingDeletedAt, otherMemoryId, userId],
      )
      await deletion.query('COMMIT')
      return waitingDeletedAt
    })().finally(() => {
      deletionSettled = true
    })

    await delay(150)
    if (deletionSettled) throw new Error('deletion_did_not_wait_for_lock')

    await access.query('COMMIT')
    const waitingDeletedAt = await waitingDeletion
    const waitingState = await setup.query(
      `SELECT
         (SELECT deleted_at FROM memories WHERE id = $1) AS memory_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $2) AS image_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $3) AS unlinked_deleted_at`,
      [otherMemoryId, otherImageId, unlinkedImageId],
    )
    const waitingRow = waitingState.rows[0]
    if (
      waitingRow?.memory_deleted_at?.getTime() !== waitingDeletedAt.getTime() ||
      waitingRow?.image_deleted_at?.getTime() !== waitingDeletedAt.getTime() ||
      waitingRow?.unlinked_deleted_at !== null
    ) {
      throw new Error('waiting_deletion_state_mismatch')
    }

    await setup.query('BEGIN')
    let imageUpdateFailed = false
    try {
      const rollbackDeletedAt = new Date()
      await setup.query(
        `UPDATE memories
         SET deleted_at = $1
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [rollbackDeletedAt, rollbackMemoryId, userId],
      )
      await setup.query(
        `UPDATE images
         SET deleted_at = $1, width = NULL
         WHERE id = $2 AND user_id = $3`,
        [rollbackDeletedAt, rollbackImageId, userId],
      )
    } catch {
      imageUpdateFailed = true
    }
    await setup.query('ROLLBACK')
    if (!imageUpdateFailed) throw new Error('image_update_did_not_fail')

    const rollbackState = await setup.query(
      `SELECT
         (SELECT deleted_at FROM memories WHERE id = $1) AS memory_deleted_at,
         (SELECT deleted_at FROM images WHERE id = $2) AS image_deleted_at`,
      [rollbackMemoryId, rollbackImageId],
    )
    const rollbackRow = rollbackState.rows[0]
    if (rollbackRow?.memory_deleted_at !== null || rollbackRow?.image_deleted_at !== null) {
      throw new Error('transaction_did_not_roll_back')
    }

    console.log('ISSUE-123 PostgreSQL concurrency QA: PASS')
  } finally {
    await setup.query('ROLLBACK').catch(() => undefined)
    await access.query('ROLLBACK').catch(() => undefined)
    await deletion.query('ROLLBACK').catch(() => undefined)
    await setup.query(`DELETE FROM profiles WHERE id = $1`, [userId]).catch(() => undefined)
    await Promise.all([
      setup.end().catch(() => undefined),
      deletion.end().catch(() => undefined),
      access.end().catch(() => undefined),
    ])
  }
}

run().catch(() => {
  console.error('ISSUE-123 PostgreSQL concurrency QA: FAIL')
  process.exitCode = 1
})
