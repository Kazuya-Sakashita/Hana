import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { checkedSyntheticPostgresUrl } from './trusted-synthetic-postgres.mjs'

const { Client } = pg

function requireExactState(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) throw new Error('trusted_child_rls_catalog_mismatch')
  }
}

async function verifyCatalog(admin) {
  const result = await admin.query(`
    SELECT
      NOT schema_owner.rolsuper
        AND schema_owner.rolcreaterole
        AND schema_owner.rolbypassrls AS "schemaOwnerSafe",
      NOT runtime.rolsuper
        AND NOT runtime.rolcreatedb
        AND NOT runtime.rolcreaterole
        AND NOT runtime.rolinherit
        AND NOT runtime.rolreplication
        AND NOT runtime.rolbypassrls AS "runtimeSafe",
      NOT owner.rolcanlogin
        AND NOT owner.rolsuper
        AND NOT owner.rolcreatedb
        AND NOT owner.rolcreaterole
        AND NOT owner.rolinherit
        AND NOT owner.rolreplication
        AND NOT owner.rolbypassrls AS "ownerSafe",
      relation.relrowsecurity AS "rowSecurity",
      relation.relforcerowsecurity AS "forceRowSecurity",
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
          AND policy.polname = 'children_owner_scope'
          AND policy.polpermissive
          AND policy.polcmd = '*'
          AND policy.polroles = ARRAY[owner.oid]::oid[]
      ) AS "policyExact",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = runtime.oid
      ) = 1 AS "runtimeMembershipCountExact",
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = runtime.oid
          AND membership.roleid = owner.oid
          AND NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
      ) AS "runtimeMembershipExact",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = owner.oid
      ) = 2 AS "ownerMembershipCountExact",
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = schema_owner.oid
          AND membership.roleid = owner.oid
          AND membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
      ) AS "schemaOwnerMembershipExact",
      has_table_privilege('hana_child_owner', 'public.children', 'SELECT, INSERT, UPDATE, DELETE')
        AS "ownerCrudGranted",
      NOT has_table_privilege('hana_child_runtime', 'public.children', 'SELECT')
        AS "runtimeDirectSelectDenied",
      NOT has_table_privilege('hana_child_owner', 'public.profiles', 'SELECT')
        AS "profileSelectDenied",
      has_function_privilege(
        'hana_child_owner',
        'public.hana_child_access_status(uuid)',
        'EXECUTE'
      ) AS "statusExecuteGranted",
      NOT has_function_privilege(
        'anon',
        'public.hana_child_access_status(uuid)',
        'EXECUTE'
      ) AS "anonymousStatusExecuteDenied",
      pg_get_userbyid(status_function.proowner) = 'postgres' AS "statusOwnerExact"
    FROM pg_catalog.pg_roles AS schema_owner
    CROSS JOIN pg_catalog.pg_roles AS runtime
    CROSS JOIN pg_catalog.pg_roles AS owner
    JOIN pg_catalog.pg_class AS relation ON relation.relname = 'children'
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_proc AS status_function
      ON status_function.oid = 'public.hana_child_access_status(uuid)'::regprocedure
    WHERE schema_owner.rolname = 'postgres'
      AND runtime.rolname = 'hana_child_runtime'
      AND owner.rolname = 'hana_child_owner'
      AND namespace.nspname = 'public'
  `)

  requireExactState(result.rows[0], {
    schemaOwnerSafe: true,
    runtimeSafe: true,
    ownerSafe: true,
    rowSecurity: true,
    forceRowSecurity: true,
    policyExact: true,
    runtimeMembershipCountExact: true,
    runtimeMembershipExact: true,
    ownerMembershipCountExact: true,
    schemaOwnerMembershipExact: true,
    ownerCrudGranted: true,
    runtimeDirectSelectDenied: true,
    profileSelectDenied: true,
    statusExecuteGranted: true,
    anonymousStatusExecuteDenied: true,
    statusOwnerExact: true,
  })
}

async function verifyOwnerBoundary(schemaOwner, runtime) {
  const ownerId = randomUUID()
  const foreignOwnerId = randomUUID()
  const ownerChildId = randomUUID()
  const foreignChildId = randomUUID()
  const missingChildId = randomUUID()

  await schemaOwner.query(
    `
      INSERT INTO public.profiles (id, updated_at)
      VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)
    `,
    [ownerId, foreignOwnerId],
  )
  try {
    await schemaOwner.query(
      `
        INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
        VALUES
          ($1, $2, 'synthetic-owner', DATE '2025-01-01', CURRENT_TIMESTAMP),
          ($3, $4, 'synthetic-foreign', DATE '2025-01-02', CURRENT_TIMESTAMP)
      `,
      [ownerChildId, ownerId, foreignChildId, foreignOwnerId],
    )

    await runtime.query('BEGIN')
    try {
      await runtime.query('SET LOCAL ROLE hana_child_owner')
      await runtime.query("SELECT set_config('hana.current_user_id', $1, true)", [ownerId])

      const visible = await runtime.query('SELECT id FROM public.children ORDER BY id')
      if (visible.rowCount !== 1 || visible.rows[0]?.id !== ownerChildId) {
        throw new Error('trusted_child_rls_select_boundary_failed')
      }

      const statuses = await runtime.query(
        `
          SELECT
            public.hana_child_access_status($1::uuid) AS owned,
            public.hana_child_access_status($2::uuid) AS foreign,
            public.hana_child_access_status($3::uuid) AS missing
        `,
        [ownerChildId, foreignChildId, missingChildId],
      )
      requireExactState(statuses.rows[0], {
        owned: 'owned',
        foreign: 'foreign',
        missing: 'missing',
      })

      const foreignUpdate = await runtime.query(
        "UPDATE public.children SET name = 'blocked' WHERE id = $1 RETURNING id",
        [foreignChildId],
      )
      const foreignDelete = await runtime.query(
        'DELETE FROM public.children WHERE id = $1 RETURNING id',
        [foreignChildId],
      )
      if (foreignUpdate.rowCount !== 0 || foreignDelete.rowCount !== 0) {
        throw new Error('trusted_child_rls_write_visibility_failed')
      }

      let foreignInsertRejected = false
      await runtime.query('SAVEPOINT foreign_insert')
      try {
        await runtime.query(
          `
            INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
            VALUES ($1, $2, 'blocked', DATE '2025-01-03', CURRENT_TIMESTAMP)
          `,
          [randomUUID(), foreignOwnerId],
        )
      } catch (error) {
        foreignInsertRejected = error?.code === '42501'
        await runtime.query('ROLLBACK TO SAVEPOINT foreign_insert')
      }
      if (!foreignInsertRejected) throw new Error('trusted_child_rls_insert_boundary_failed')

      await runtime.query('ROLLBACK')
    } catch (error) {
      await runtime.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  } finally {
    await schemaOwner
      .query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [[ownerId, foreignOwnerId]])
      .catch(() => undefined)
  }
}

async function run() {
  const expectedPort = process.env.HANA_SYNTHETIC_POSTGRES_PORT
  const adminUrl = checkedSyntheticPostgresUrl(
    process.env.DATABASE_URL,
    'hana_admin',
    'hana-admin',
    expectedPort,
  )
  const schemaOwnerUrl = checkedSyntheticPostgresUrl(
    process.env.DIRECT_URL,
    'postgres',
    'synthetic-schema-owner',
    expectedPort,
  )
  const runtimeUrl = checkedSyntheticPostgresUrl(
    process.env.CHILD_DATABASE_URL,
    'hana_child_runtime',
    'synthetic-runtime',
    expectedPort,
  )
  const admin = new Client({ connectionString: adminUrl })
  const schemaOwner = new Client({ connectionString: schemaOwnerUrl })
  const runtime = new Client({ connectionString: runtimeUrl })

  try {
    await Promise.all([admin.connect(), schemaOwner.connect(), runtime.connect()])
    await verifyCatalog(admin)
    await verifyOwnerBoundary(schemaOwner, runtime)
    process.stdout.write('ISSUE-184 trusted child RLS evidence: PASS\n')
  } catch {
    throw new Error('trusted_child_rls_evidence_failed')
  } finally {
    await Promise.all([
      admin.end().catch(() => undefined),
      schemaOwner.end().catch(() => undefined),
      runtime.end().catch(() => undefined),
    ])
  }
}

run().catch(() => {
  process.stderr.write('ISSUE-184 trusted child RLS evidence: FAIL\n')
  process.exitCode = 1
})
