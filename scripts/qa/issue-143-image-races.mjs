import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg
const LOCK_PREFIX = 'hana:image:'
let qaStage = 'startup'

const stages = {
  saveFirst: 'save_first_cleanup_waited',
  claimFirst: 'claim_first_save_rejected',
  deletionFirst: 'account_deletion_first_cleanup_protected',
  cleanupProfileFirst: 'cleanup_profile_first_deletion_waited',
  reverseOrder: 'reverse_order_save_no_partial_link',
  aiFirst: 'ai_first_delete_waited',
  finalizeRollback: 'finalize_rollback_retry_converged',
}

function assertSafeTarget(connectionString) {
  if (process.env.ISSUE_143_DATABASE_QA !== '1') throw new Error('qa_opt_in_required')
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hana_ci') {
    throw new Error('synthetic_local_database_required')
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function lock(client, imageId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${LOCK_PREFIX}${imageId}`,
  ])
}

async function lockMany(client, imageIds) {
  for (const imageId of [...new Set(imageIds)].sort()) await lock(client, imageId)
}

async function begin(client) {
  await client.query('BEGIN')
  await client.query(`SET LOCAL statement_timeout = '3s'`)
}

async function insertImage(setup, userId, imageId, now) {
  await setup.query(
    `INSERT INTO images
      (id, user_id, storage_key, content_type, width, height, file_size,
       metadata_sanitized_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'image/jpeg', 1, 1, 4, $4, $4, $4)`,
    [imageId, userId, `uploads/synthetic/202608/${imageId}.jpg`, now],
  )
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('database_url_required')
  assertSafeTarget(connectionString)

  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const userId = randomUUID()
  const childId = randomUUID()
  const now = new Date()
  const imageIds = Array.from({ length: 9 }, () => randomUUID())

  try {
    await Promise.all([setup.connect(), first.connect(), second.connect()])
    await setup.query('INSERT INTO profiles (id, updated_at) VALUES ($1, $2)', [userId, now])
    await setup.query(
      `INSERT INTO children (id, user_id, name, birthdate, updated_at)
       VALUES ($1, $2, 'synthetic', DATE '2025-01-01', $3)`,
      [childId, userId, now],
    )
    for (const imageId of imageIds) await insertImage(setup, userId, imageId, now)

    const [saveFirstId, claimFirstId, deletionFirstId, profileFirstId] = imageIds
    const [reverseAId, reverseBId, aiFirstId, finalizeRollbackId] = imageIds.slice(4)

    qaStage = stages.saveFirst
    await begin(first)
    await lock(first, saveFirstId)
    const saveFirstMemoryId = randomUUID()
    await first.query(
      `INSERT INTO memories (id, user_id, child_id, title, recorded_at, updated_at)
       VALUES ($1, $2, $3, 'synthetic', DATE '2026-08-01', $4)`,
      [saveFirstMemoryId, userId, childId, now],
    )
    await first.query(
      `UPDATE images SET memory_id = $1, memory_position = 0
       WHERE id = $2 AND memory_id IS NULL AND deleted_at IS NULL`,
      [saveFirstMemoryId, saveFirstId],
    )
    let cleanupAfterSaveSettled = false
    const cleanupAfterSave = (async () => {
      await begin(second)
      await lock(second, saveFirstId)
      const row = await second.query('SELECT memory_id, deleted_at FROM images WHERE id = $1', [
        saveFirstId,
      ])
      await second.query('ROLLBACK')
      return row.rows[0]
    })().finally(() => {
      cleanupAfterSaveSettled = true
    })
    await delay(100)
    if (cleanupAfterSaveSettled) throw new Error(stages.saveFirst)
    await first.query('COMMIT')
    const saved = await cleanupAfterSave
    if (saved?.memory_id !== saveFirstMemoryId || saved?.deleted_at) {
      throw new Error(stages.saveFirst)
    }

    qaStage = stages.claimFirst
    await begin(first)
    await lock(first, claimFirstId)
    await first.query(
      `UPDATE images SET deleted_at = $1
       WHERE id = $2 AND memory_id IS NULL AND deleted_at IS NULL`,
      [now, claimFirstId],
    )
    let saveAfterClaimSettled = false
    const saveAfterClaim = (async () => {
      await begin(second)
      await lock(second, claimFirstId)
      const active = await second.query(
        'SELECT id FROM images WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NULL',
        [claimFirstId],
      )
      await second.query('ROLLBACK')
      return active.rowCount
    })().finally(() => {
      saveAfterClaimSettled = true
    })
    await delay(100)
    if (saveAfterClaimSettled) throw new Error(stages.claimFirst)
    await first.query('COMMIT')
    if ((await saveAfterClaim) !== 0) throw new Error(stages.claimFirst)

    qaStage = stages.deletionFirst
    await begin(first)
    await first.query(
      `UPDATE profiles
       SET access_blocked_at = $1, deletion_requested_at = $1
       WHERE id = $2`,
      [now, userId],
    )
    let cleanupAfterDeletionSettled = false
    const cleanupAfterDeletion = (async () => {
      await begin(second)
      await lock(second, deletionFirstId)
      const active = await second.query(
        `SELECT id FROM profiles
         WHERE id = $1 AND access_blocked_at IS NULL AND deletion_requested_at IS NULL
         FOR UPDATE`,
        [userId],
      )
      if (active.rowCount === 1) {
        await second.query('UPDATE images SET deleted_at = $1 WHERE id = $2', [
          now,
          deletionFirstId,
        ])
      }
      await second.query('ROLLBACK')
      return active.rowCount
    })().finally(() => {
      cleanupAfterDeletionSettled = true
    })
    await delay(100)
    if (cleanupAfterDeletionSettled) throw new Error(stages.deletionFirst)
    await first.query('COMMIT')
    if ((await cleanupAfterDeletion) !== 0) throw new Error(stages.deletionFirst)
    const protectedImage = await setup.query('SELECT deleted_at FROM images WHERE id = $1', [
      deletionFirstId,
    ])
    if (protectedImage.rows[0]?.deleted_at) throw new Error(stages.deletionFirst)
    await setup.query(
      `UPDATE profiles SET access_blocked_at = NULL, deletion_requested_at = NULL WHERE id = $1`,
      [userId],
    )

    qaStage = stages.cleanupProfileFirst
    await begin(first)
    await lock(first, profileFirstId)
    const activeProfile = await first.query(
      `SELECT id FROM profiles
       WHERE id = $1 AND access_blocked_at IS NULL AND deletion_requested_at IS NULL
       FOR UPDATE`,
      [userId],
    )
    if (activeProfile.rowCount !== 1) throw new Error(stages.cleanupProfileFirst)
    let deletionAfterCleanupSettled = false
    const deletionAfterCleanup = second
      .query(
        `UPDATE profiles
         SET access_blocked_at = $1, deletion_requested_at = $1
         WHERE id = $2`,
        [now, userId],
      )
      .finally(() => {
        deletionAfterCleanupSettled = true
      })
    await delay(100)
    if (deletionAfterCleanupSettled) throw new Error(stages.cleanupProfileFirst)
    await first.query(
      `UPDATE images SET deleted_at = $1
       WHERE id = $2 AND memory_id IS NULL AND deleted_at IS NULL`,
      [now, profileFirstId],
    )
    await first.query('COMMIT')
    await deletionAfterCleanup
    const profileFirstClaim = await setup.query('SELECT deleted_at FROM images WHERE id = $1', [
      profileFirstId,
    ])
    if (!profileFirstClaim.rows[0]?.deleted_at) throw new Error(stages.cleanupProfileFirst)
    await setup.query(
      `UPDATE profiles SET access_blocked_at = NULL, deletion_requested_at = NULL WHERE id = $1`,
      [userId],
    )

    qaStage = stages.reverseOrder
    await begin(first)
    await lockMany(first, [reverseBId, reverseAId])
    const reverseMemoryId = randomUUID()
    await first.query(
      `INSERT INTO memories (id, user_id, child_id, title, recorded_at, updated_at)
       VALUES ($1, $2, $3, 'synthetic', DATE '2026-08-01', $4)`,
      [reverseMemoryId, userId, childId, now],
    )
    let reverseSaveSettled = false
    const reverseSave = (async () => {
      await begin(second)
      await lockMany(second, [reverseAId, reverseBId])
      const active = await second.query(
        `SELECT id FROM images
         WHERE id = ANY($1::uuid[]) AND memory_id IS NULL AND deleted_at IS NULL`,
        [[reverseBId, reverseAId]],
      )
      await second.query('ROLLBACK')
      return active.rowCount
    })().finally(() => {
      reverseSaveSettled = true
    })
    await delay(100)
    if (reverseSaveSettled) throw new Error(stages.reverseOrder)
    const linked = await first.query(
      `UPDATE images SET memory_id = $1,
         memory_position = CASE id WHEN $2::uuid THEN 0 ELSE 1 END
       WHERE id = ANY($3::uuid[]) AND memory_id IS NULL AND deleted_at IS NULL`,
      [reverseMemoryId, reverseBId, [reverseBId, reverseAId]],
    )
    if (linked.rowCount !== 2) throw new Error(stages.reverseOrder)
    await first.query('COMMIT')
    if ((await reverseSave) !== 0) throw new Error(stages.reverseOrder)
    const linkedRows = await setup.query(
      `SELECT memory_id, memory_position FROM images
       WHERE id = ANY($1::uuid[]) ORDER BY memory_position`,
      [[reverseAId, reverseBId]],
    )
    if (
      linkedRows.rowCount !== 2 ||
      linkedRows.rows.some((row) => row.memory_id !== reverseMemoryId) ||
      linkedRows.rows[0]?.memory_position !== 0 ||
      linkedRows.rows[1]?.memory_position !== 1
    ) {
      throw new Error(stages.reverseOrder)
    }

    qaStage = stages.aiFirst
    await begin(first)
    await lock(first, aiFirstId)
    const aiEligible = await first.query(
      'SELECT id FROM images WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NULL',
      [aiFirstId],
    )
    if (aiEligible.rowCount !== 1) throw new Error(stages.aiFirst)
    let deleteAfterAiSettled = false
    const deleteAfterAi = (async () => {
      await begin(second)
      await lock(second, aiFirstId)
      const claimed = await second.query(
        `UPDATE images SET deleted_at = $1
         WHERE id = $2 AND memory_id IS NULL AND deleted_at IS NULL`,
        [now, aiFirstId],
      )
      await second.query('COMMIT')
      return claimed.rowCount
    })().finally(() => {
      deleteAfterAiSettled = true
    })
    await delay(100)
    if (deleteAfterAiSettled) throw new Error(stages.aiFirst)
    await first.query('ROLLBACK')
    if ((await deleteAfterAi) !== 1) throw new Error(stages.aiFirst)

    qaStage = stages.finalizeRollback
    await begin(first)
    await lock(first, finalizeRollbackId)
    const claimedForFinalize = await first.query(
      `UPDATE images SET deleted_at = $1
       WHERE id = $2 AND memory_id IS NULL AND deleted_at IS NULL`,
      [now, finalizeRollbackId],
    )
    if (claimedForFinalize.rowCount !== 1) throw new Error(stages.finalizeRollback)
    await first.query('COMMIT')

    await begin(first)
    await lock(first, finalizeRollbackId)
    await first.query(
      'DELETE FROM images WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NOT NULL',
      [finalizeRollbackId],
    )
    await first.query('ROLLBACK')
    const durableClaim = await setup.query(
      `SELECT id FROM images
       WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NOT NULL`,
      [finalizeRollbackId],
    )
    const saveableAfterRollback = await setup.query(
      `SELECT id FROM images
       WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NULL`,
      [finalizeRollbackId],
    )
    if (durableClaim.rowCount !== 1 || saveableAfterRollback.rowCount !== 0) {
      throw new Error(stages.finalizeRollback)
    }
    await begin(second)
    await lock(second, finalizeRollbackId)
    const finalized = await second.query(
      'DELETE FROM images WHERE id = $1 AND memory_id IS NULL AND deleted_at IS NOT NULL',
      [finalizeRollbackId],
    )
    await second.query('COMMIT')
    if (finalized.rowCount !== 1) throw new Error(stages.finalizeRollback)

    process.stdout.write(
      `${JSON.stringify(Object.fromEntries(Object.values(stages).map((stage) => [stage, 'pass'])))}\n`,
    )
  } finally {
    await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')])
    await setup.query('DELETE FROM profiles WHERE id = $1', [userId]).catch(() => undefined)
    await Promise.allSettled([setup.end(), first.end(), second.end()])
  }
}

run().catch(() => {
  process.stderr.write(`issue-143 synthetic concurrency QA failed at ${qaStage}\n`)
  process.exitCode = 1
})
