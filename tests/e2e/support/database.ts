import { createHmac, randomUUID } from 'node:crypto'
import pg from 'pg'
import { E2E_CHILD_ID, E2E_USER_ID } from './constants'
import { assertSyntheticE2eEnvironment } from './environment'

const { Client } = pg
const E2E_PRODUCT_EVENT_HASH_PEPPER = 'synthetic-product-event-pepper-32-bytes'

function syntheticActorHash(userId: string) {
  return createHmac('sha256', E2E_PRODUCT_EVENT_HASH_PEPPER).update(userId).digest('hex')
}

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

export async function readSyntheticTelemetryFlow(flowId: string) {
  const client = new Client({ connectionString: connectionString() })
  await client.connect()
  try {
    const [memory, events] = await Promise.all([
      client.query<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM memories WHERE user_id = $1 AND idempotency_key = $2`,
        [E2E_USER_ID, flowId],
      ),
      client.query<{ event_id: string; event_name: string; flow_id: string }>(
        `SELECT event_id, event_name, flow_id FROM product_events WHERE flow_id = $1 AND actor_hash = $2 ORDER BY event_name`,
        [flowId, syntheticActorHash(E2E_USER_ID)],
      ),
    ])
    return {
      memoryIdempotencyKey: memory.rows[0]?.idempotency_key ?? null,
      events: events.rows.map((event) => ({
        eventId: event.event_id,
        eventName: event.event_name,
        flowId: event.flow_id,
      })),
    }
  } finally {
    await client.end()
  }
}

export async function seedCrossActorTelemetryNoise(flowId: string) {
  const client = new Client({ connectionString: connectionString() })
  await client.connect()
  const actorHash = syntheticActorHash('00000000-0000-4000-8000-000000000199')
  try {
    for (const [eventName, elapsedBucket] of [
      ['record_started', 'not_applicable'],
      ['photo_selected', 'under_10s'],
      ['memory_saved', 'from_10_to_30s'],
    ] as const) {
      await client.query(
        `INSERT INTO product_events (event_id, actor_hash, flow_id, event_name, elapsed_bucket) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), actorHash, flowId, eventName, elapsedBucket],
      )
    }
  } finally {
    await client.end()
  }
}

export async function cleanupCrossActorTelemetryNoise(flowId: string) {
  const client = new Client({ connectionString: connectionString() })
  await client.connect()
  try {
    await client.query(`DELETE FROM product_events WHERE actor_hash = $1 AND flow_id = $2`, [
      syntheticActorHash('00000000-0000-4000-8000-000000000199'),
      flowId,
    ])
  } finally {
    await client.end()
  }
}
