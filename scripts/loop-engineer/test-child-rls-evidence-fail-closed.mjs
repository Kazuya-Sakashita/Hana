import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { checkedSyntheticPostgresUrl } from './trusted-synthetic-postgres.mjs'

const { Client } = pg
const verifierPath = fileURLToPath(new URL('./verify-child-rls-evidence.mjs', import.meta.url))

function runVerifier(environment, expectedStatus, expectedOutput) {
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env: environment,
    timeout: 30_000,
  })
  if (
    result.status !== expectedStatus ||
    result.signal !== null ||
    result.stdout !== expectedOutput.stdout ||
    result.stderr !== expectedOutput.stderr
  ) {
    throw new Error('trusted_child_rls_adversarial_expectation_failed')
  }
}

async function transaction(client, statements) {
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '10s'")
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function requireTrue(value) {
  if (value !== true) throw new Error('trusted_child_rls_adversarial_mutation_missing')
}

async function run() {
  const expectedPort = process.env.HANA_SYNTHETIC_POSTGRES_PORT
  const databaseUrl = checkedSyntheticPostgresUrl(
    process.env.DATABASE_URL,
    'hana_admin',
    'hana-admin',
    expectedPort,
  )
  const directUrl = checkedSyntheticPostgresUrl(
    process.env.DIRECT_URL,
    'postgres',
    'synthetic-schema-owner',
    expectedPort,
  )
  const childDatabaseUrl = checkedSyntheticPostgresUrl(
    process.env.CHILD_DATABASE_URL,
    'hana_child_runtime',
    'synthetic-runtime',
    expectedPort,
  )
  const verifierEnvironment = {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    CHILD_DATABASE_URL: childDatabaseUrl,
    HANA_SYNTHETIC_POSTGRES_PORT: expectedPort ?? '5432',
  }
  const pass = {
    stdout: 'ISSUE-184 trusted child RLS evidence: PASS\n',
    stderr: '',
  }
  const fail = {
    stdout: '',
    stderr: 'ISSUE-184 trusted child RLS evidence: FAIL\n',
  }
  const admin = new Client({ connectionString: databaseUrl })
  const schemaOwner = new Client({ connectionString: directUrl })
  const runtime = new Client({ connectionString: childDatabaseUrl })
  const extraPolicy = `issue_184_${randomUUID().replaceAll('-', '')}`
  const parentRole = `issue_184_${randomUUID().replaceAll('-', '')}`
  const exposedView = `issue_184_${randomUUID().replaceAll('-', '')}`
  const routineSchema = `issue_184_${randomUUID().replaceAll('-', '')}`
  const routineName = `issue_184_${randomUUID().replaceAll('-', '')}`
  const viewSchema = `issue_184_${randomUUID().replaceAll('-', '')}`
  const viewName = `issue_184_${randomUUID().replaceAll('-', '')}`
  const ownerId = randomUUID()
  const foreignOwnerId = randomUUID()
  const ownerChildId = randomUUID()
  const foreignChildId = randomUUID()

  try {
    await Promise.all([admin.connect(), schemaOwner.connect(), runtime.connect()])
    runVerifier(verifierEnvironment, 0, pass)
    const schemaOwnerDatabaseCreate = await admin.query(`
      SELECT NOT has_database_privilege('postgres', current_database(), 'CREATE') AS denied
    `)
    requireTrue(schemaOwnerDatabaseCreate.rows[0]?.denied)

    await schemaOwner.query(
      `
        INSERT INTO public.profiles (id, updated_at)
        VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)
      `,
      [ownerId, foreignOwnerId],
    )
    await schemaOwner.query(
      `
        INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
        VALUES
          ($1, $2, $3, DATE '2025-02-01', CURRENT_TIMESTAMP),
          ($4, $5, $6, DATE '2025-02-02', CURRENT_TIMESTAMP)
      `,
      [ownerChildId, ownerId, randomUUID(), foreignChildId, foreignOwnerId, randomUUID()],
    )

    await admin.query(`
      ALTER POLICY children_owner_scope ON public.children
      USING (user_id = public.hana_current_user_id())
      WITH CHECK (false)
    `)
    try {
      const mutation = await admin.query(`
        SELECT pg_get_expr(policy.polwithcheck, policy.polrelid, false) = 'false' AS present
        FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = 'public.children'::regclass
          AND policy.polname = 'children_owner_scope'
      `)
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await admin.query(`
        ALTER POLICY children_owner_scope ON public.children
        USING (user_id = public.hana_current_user_id())
        WITH CHECK (user_id = public.hana_current_user_id())
      `)
    }
    runVerifier(verifierEnvironment, 0, pass)

    await admin.query(
      'GRANT EXECUTE ON FUNCTION public.hana_child_access_status(uuid) TO authenticated',
    )
    try {
      const mutation = await admin.query(`
        SELECT has_function_privilege(
          'authenticated',
          'public.hana_child_access_status(uuid)',
          'EXECUTE'
        ) AS present
      `)
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await admin.query(
        'REVOKE EXECUTE ON FUNCTION public.hana_child_access_status(uuid) FROM authenticated',
      )
    }
    runVerifier(verifierEnvironment, 0, pass)

    await transaction(admin, [
      `CREATE VIEW public.${exposedView} AS SELECT * FROM public.children`,
      `GRANT SELECT ON TABLE public.${exposedView} TO hana_child_runtime`,
    ])
    try {
      const mutation = await admin.query(
        `
          SELECT to_regclass($1) IS NOT NULL
            AND has_table_privilege('hana_child_runtime', $1, 'SELECT') AS present
        `,
        [`public.${exposedView}`],
      )
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await admin.query(`DROP VIEW IF EXISTS public.${exposedView}`)
    }
    runVerifier(verifierEnvironment, 0, pass)

    await admin.query(`CREATE SCHEMA ${routineSchema} AUTHORIZATION postgres`)
    await transaction(schemaOwner, [
      `
        CREATE FUNCTION ${routineSchema}.${routineName}()
        RETURNS SETOF uuid
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $function$
          SELECT child.id FROM public.children AS child ORDER BY child.id
        $function$
      `,
      `REVOKE ALL ON FUNCTION ${routineSchema}.${routineName}() FROM PUBLIC`,
      `GRANT USAGE ON SCHEMA ${routineSchema} TO hana_child_runtime`,
      `GRANT EXECUTE ON FUNCTION ${routineSchema}.${routineName}() TO hana_child_runtime`,
    ])
    try {
      const mutation = await admin.query(
        `
          SELECT routine.prosecdef
            AND pg_get_userbyid(routine.proowner) = 'postgres'
            AND routine.proconfig = ARRAY['search_path=pg_catalog']::text[]
            AND has_function_privilege('hana_child_runtime', routine.oid, 'EXECUTE')
            AS present
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = to_regprocedure($1)
        `,
        [`${routineSchema}.${routineName}()`],
      )
      requireTrue(mutation.rows[0]?.present)
      const exposed = await runtime.query(
        `
          SELECT count(*)::integer AS count
          FROM ${routineSchema}.${routineName}() AS exposed(id)
          WHERE id = ANY($1::uuid[])
        `,
        [[ownerChildId, foreignChildId]],
      )
      requireTrue(exposed.rows[0]?.count === 2)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await admin.query(`DROP SCHEMA IF EXISTS ${routineSchema} CASCADE`)
    }
    const routineRestored = await admin.query(
      'SELECT to_regnamespace($1) IS NULL AND to_regprocedure($2) IS NULL AS restored',
      [routineSchema, `${routineSchema}.${routineName}()`],
    )
    requireTrue(routineRestored.rows[0]?.restored)
    runVerifier(verifierEnvironment, 0, pass)

    await admin.query(`CREATE SCHEMA ${viewSchema} AUTHORIZATION postgres`)
    await transaction(schemaOwner, [
      `CREATE VIEW ${viewSchema}.${viewName} AS SELECT * FROM public.children`,
      `GRANT USAGE ON SCHEMA ${viewSchema} TO hana_child_owner`,
      `GRANT SELECT ON TABLE ${viewSchema}.${viewName} TO hana_child_owner`,
    ])
    try {
      const mutation = await admin.query(
        `
          SELECT relation.relkind = 'v'
            AND pg_get_userbyid(relation.relowner) = 'postgres'
            AND NOT COALESCE(relation.reloptions, '{}') @> ARRAY['security_invoker=true']
            AND has_table_privilege('hana_child_owner', relation.oid, 'SELECT')
            AS present
          FROM pg_catalog.pg_class AS relation
          WHERE relation.oid = to_regclass($1)
        `,
        [`${viewSchema}.${viewName}`],
      )
      requireTrue(mutation.rows[0]?.present)
      await runtime.query('BEGIN')
      try {
        await runtime.query('SET LOCAL ROLE hana_child_owner')
        await runtime.query("SELECT set_config('hana.current_user_id', $1, true)", [ownerId])
        const direct = await runtime.query(
          'SELECT count(*)::integer AS count FROM public.children WHERE id = ANY($1::uuid[])',
          [[ownerChildId, foreignChildId]],
        )
        const exposed = await runtime.query(
          `
            SELECT count(*)::integer AS count
            FROM ${viewSchema}.${viewName}
            WHERE id = ANY($1::uuid[])
          `,
          [[ownerChildId, foreignChildId]],
        )
        requireTrue(direct.rows[0]?.count === 1 && exposed.rows[0]?.count === 2)
      } finally {
        await runtime.query('ROLLBACK').catch(() => undefined)
      }
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await admin.query(`DROP SCHEMA IF EXISTS ${viewSchema} CASCADE`)
    }
    const viewRestored = await admin.query(
      'SELECT to_regnamespace($1) IS NULL AND to_regclass($2) IS NULL AS restored',
      [viewSchema, `${viewSchema}.${viewName}`],
    )
    requireTrue(viewRestored.rows[0]?.restored)
    runVerifier(verifierEnvironment, 0, pass)

    await schemaOwner.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated',
    )
    try {
      const mutation = await admin.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_default_acl AS default_acl
          CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
          JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
          WHERE default_acl.defaclrole = 'postgres'::regrole
            AND default_acl.defaclnamespace = 'public'::regnamespace
            AND grantee.rolname = 'authenticated'
            AND acl.privilege_type = 'SELECT'
        ) AS present
      `)
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await schemaOwner.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM authenticated',
      )
    }
    const defaultAclRestored = await admin.query(`
      SELECT NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_default_acl
      ) AS restored
    `)
    requireTrue(defaultAclRestored.rows[0]?.restored)
    runVerifier(verifierEnvironment, 0, pass)

    await transaction(admin, [
      'GRANT INSERT ON TABLE public.children TO hana_child_runtime',
      `CREATE POLICY ${extraPolicy} ON public.children FOR INSERT TO hana_child_runtime WITH CHECK (true)`,
    ])
    try {
      const mutation = await admin.query(`
        SELECT
          has_table_privilege('hana_child_runtime', 'public.children', 'INSERT')
            AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid = 'public.children'::regclass) = 2
            AS present
      `)
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await transaction(admin, [
        `DROP POLICY IF EXISTS ${extraPolicy} ON public.children`,
        'REVOKE INSERT ON TABLE public.children FROM hana_child_runtime',
      ])
    }
    runVerifier(verifierEnvironment, 0, pass)

    await transaction(admin, [
      `CREATE ROLE ${parentRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS`,
      `GRANT ${parentRole} TO hana_child_owner WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
    ])
    try {
      const mutation = await admin.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
          JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
          WHERE member.rolname = 'hana_child_owner'
            AND parent.rolname = $1
            AND membership.set_option
        ) AS present
      `,
        [parentRole],
      )
      requireTrue(mutation.rows[0]?.present)
      runVerifier(verifierEnvironment, 1, fail)
    } finally {
      await transaction(admin, [
        `REVOKE ${parentRole} FROM hana_child_owner`,
        `DROP ROLE IF EXISTS ${parentRole}`,
      ])
    }
    runVerifier(verifierEnvironment, 0, pass)
    await schemaOwner.query('DELETE FROM public.children WHERE id = ANY($1::uuid[])', [
      [ownerChildId, foreignChildId],
    ])
    await schemaOwner.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [
      [ownerId, foreignOwnerId],
    ])
    runVerifier(verifierEnvironment, 0, pass)
    process.stdout.write('ISSUE-184 trusted child RLS adversarial checks: PASS\n')
  } finally {
    await admin.query(`DROP VIEW IF EXISTS public.${exposedView}`).catch(() => undefined)
    await admin.query(`DROP SCHEMA IF EXISTS ${routineSchema} CASCADE`).catch(() => undefined)
    await admin.query(`DROP SCHEMA IF EXISTS ${viewSchema} CASCADE`).catch(() => undefined)
    await schemaOwner
      .query('DELETE FROM public.children WHERE id = ANY($1::uuid[])', [
        [ownerChildId, foreignChildId],
      ])
      .catch(() => undefined)
    await schemaOwner
      .query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [[ownerId, foreignOwnerId]])
      .catch(() => undefined)
    await Promise.all([
      admin.end().catch(() => undefined),
      schemaOwner.end().catch(() => undefined),
      runtime.end().catch(() => undefined),
    ])
  }
}

run().catch(() => {
  process.stderr.write('ISSUE-184 trusted child RLS adversarial checks: FAIL\n')
  process.exitCode = 1
})
