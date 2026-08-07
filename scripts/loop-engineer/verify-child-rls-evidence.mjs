import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { checkedSyntheticPostgresUrl } from './trusted-synthetic-postgres.mjs'

const { Client } = pg

const expectedCurrentUserSource = `DECLARE
  raw_user_id text := current_setting('hana.current_user_id', true);
BEGIN
  IF raw_user_id IS NULL OR raw_user_id = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw_user_id::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END`

const expectedAccessStatusSource = `
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.children AS child
      WHERE child.id = target_child_id
        AND child.deleted_at IS NULL
        AND child.user_id = public.hana_current_user_id()
    ) THEN 'owned'
    WHEN EXISTS (
      SELECT 1
      FROM public.children AS child
      WHERE child.id = target_child_id
        AND child.deleted_at IS NULL
    ) THEN 'foreign'
    ELSE 'missing'
  END`.trim()

function requireExactState(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) throw new Error('trusted_child_rls_catalog_mismatch')
  }
}

function requireExactPolicies(actual) {
  if (!Array.isArray(actual) || actual.length !== 1) {
    throw new Error('trusted_child_rls_catalog_mismatch')
  }
  const [policy] = actual
  requireExactState(policy, {
    name: 'children_owner_scope',
    permissive: true,
    command: '*',
    using: '(user_id = public.hana_current_user_id())',
    withCheck: '(user_id = public.hana_current_user_id())',
  })
  if (
    !Array.isArray(policy.roles) ||
    policy.roles.length !== 1 ||
    policy.roles[0] !== 'hana_child_owner'
  ) {
    throw new Error('trusted_child_rls_catalog_mismatch')
  }
}

async function verifyCatalog(admin) {
  await admin.query('BEGIN')
  await admin.query('SET LOCAL search_path = pg_catalog')
  const policies = await admin.query(`
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', policy.polname,
          'permissive', policy.polpermissive,
          'command', policy.polcmd,
          'roles', (
            SELECT jsonb_agg(
              COALESCE(role.rolname, 'PUBLIC')
              ORDER BY COALESCE(role.rolname, 'PUBLIC')
            )
            FROM unnest(policy.polroles) AS assigned(role_oid)
            LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = assigned.role_oid
          ),
          'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false),
          'withCheck', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false)
        )
        ORDER BY policy.polname
      ),
      '[]'::jsonb
    ) AS policies
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.children'::regclass
  `)
  requireExactPolicies(policies.rows[0]?.policies)

  const result = await admin.query(`
    SELECT
      NOT schema_owner.rolsuper
        AND schema_owner.rolcreaterole
        AND schema_owner.rolbypassrls AS "schemaOwnerSafe",
      runtime.rolcanlogin
        AND NOT runtime.rolsuper
        AND NOT runtime.rolcreatedb
        AND NOT runtime.rolcreaterole
        AND NOT runtime.rolinherit
        AND NOT runtime.rolreplication
        AND NOT runtime.rolbypassrls
        AND COALESCE(cardinality(runtime.rolconfig), 0) = 0 AS "runtimeSafe",
      NOT owner.rolcanlogin
        AND NOT owner.rolsuper
        AND NOT owner.rolcreatedb
        AND NOT owner.rolcreaterole
        AND NOT owner.rolinherit
        AND NOT owner.rolreplication
        AND NOT owner.rolbypassrls AS "ownerSafe",
      relation.relrowsecurity AS "rowSecurity",
      relation.relforcerowsecurity AS "forceRowSecurity",
      pg_get_userbyid(relation.relowner) = 'postgres' AS "relationOwnerExact",
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger AS trigger
        WHERE trigger.tgrelid = relation.oid
          AND NOT trigger.tgisinternal
      ) AS "userTriggersAbsent",
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_db_role_setting AS database_setting
        WHERE database_setting.setrole = runtime.oid
      ) AS "runtimeDatabaseConfigClean",
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter
        WHERE has_parameter_privilege(runtime.oid, parameter.parname, 'SET')
          OR has_parameter_privilege(runtime.oid, parameter.parname, 'ALTER SYSTEM')
          OR has_parameter_privilege(owner.oid, parameter.parname, 'SET')
          OR has_parameter_privilege(owner.oid, parameter.parname, 'ALTER SYSTEM')
      ) AS "parameterAclClean",
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
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = runtime.oid
      ) AS "runtimeHasNoMembers",
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
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = owner.oid
      ) AS "ownerHasNoParentRole",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_roles AS candidate
        WHERE candidate.oid <> owner.oid
          AND NOT candidate.rolsuper
          AND pg_has_role(candidate.oid, owner.oid, 'SET')
      ) = 1 AS "ownerSetterExact",
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS target
        WHERE target.oid <> owner.oid
          AND pg_has_role(owner.oid, target.oid, 'SET')
      ) AS "ownerCannotSetOtherRole",
      has_table_privilege(owner.oid, relation.oid, 'SELECT') AS "ownerSelectGranted",
      has_table_privilege(owner.oid, relation.oid, 'INSERT') AS "ownerInsertGranted",
      has_table_privilege(owner.oid, relation.oid, 'UPDATE') AS "ownerUpdateGranted",
      has_table_privilege(owner.oid, relation.oid, 'DELETE') AS "ownerDeleteGranted",
      NOT has_table_privilege(owner.oid, relation.oid, 'TRUNCATE') AS "ownerTruncateDenied",
      NOT has_table_privilege(owner.oid, relation.oid, 'REFERENCES') AS "ownerReferencesDenied",
      NOT has_table_privilege(owner.oid, relation.oid, 'TRIGGER') AS "ownerTriggerDenied",
      NOT has_table_privilege(runtime.oid, relation.oid, 'SELECT')
        AND NOT has_any_column_privilege(runtime.oid, relation.oid, 'SELECT')
        AS "runtimeSelectDenied",
      NOT has_table_privilege(runtime.oid, relation.oid, 'INSERT')
        AND NOT has_any_column_privilege(runtime.oid, relation.oid, 'INSERT')
        AS "runtimeInsertDenied",
      NOT has_table_privilege(runtime.oid, relation.oid, 'UPDATE')
        AND NOT has_any_column_privilege(runtime.oid, relation.oid, 'UPDATE')
        AS "runtimeUpdateDenied",
      NOT has_table_privilege(runtime.oid, relation.oid, 'DELETE') AS "runtimeDeleteDenied",
      NOT has_table_privilege('hana_child_owner', 'public.profiles', 'SELECT')
        AS "profileSelectDenied",
      has_function_privilege(owner.oid, current_user_function.oid, 'EXECUTE')
        AS "currentUserExecuteGranted",
      NOT has_function_privilege(runtime.oid, current_user_function.oid, 'EXECUTE')
        AS "runtimeCurrentUserExecuteDenied",
      pg_get_userbyid(current_user_function.proowner) = 'postgres'
        AND NOT current_user_function.prosecdef
        AND current_user_function.provolatile = 's'
        AND current_user_function.prorettype = 'uuid'::regtype
        AND current_user_language.lanname = 'plpgsql'
        AND current_user_function.proconfig = ARRAY['search_path=pg_catalog']::text[]
        AS "currentUserFunctionExact",
      current_user_function.prosrc AS "currentUserSource",
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
      NOT has_function_privilege(runtime.oid, status_function.oid, 'EXECUTE')
        AS "runtimeStatusExecuteDenied",
      pg_get_userbyid(status_function.proowner) = 'postgres'
        AND status_function.prosecdef
        AND status_function.provolatile = 's'
        AND status_function.prorettype = 'text'::regtype
        AND status_language.lanname = 'sql'
        AND status_function.proconfig = ARRAY['search_path=pg_catalog']::text[]
        AS "statusFunctionExact",
      status_function.prosrc AS "statusFunctionSource"
    FROM pg_catalog.pg_roles AS schema_owner
    CROSS JOIN pg_catalog.pg_roles AS runtime
    CROSS JOIN pg_catalog.pg_roles AS owner
    JOIN pg_catalog.pg_class AS relation ON relation.relname = 'children'
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_proc AS status_function
      ON status_function.oid = 'public.hana_child_access_status(uuid)'::regprocedure
    JOIN pg_catalog.pg_language AS status_language ON status_language.oid = status_function.prolang
    JOIN pg_catalog.pg_proc AS current_user_function
      ON current_user_function.oid = 'public.hana_current_user_id()'::regprocedure
    JOIN pg_catalog.pg_language AS current_user_language
      ON current_user_language.oid = current_user_function.prolang
    WHERE schema_owner.rolname = 'postgres'
      AND runtime.rolname = 'hana_child_runtime'
      AND owner.rolname = 'hana_child_owner'
      AND namespace.nspname = 'public'
  `)

  await admin.query('ROLLBACK')

  requireExactState(result.rows[0], {
    schemaOwnerSafe: true,
    runtimeSafe: true,
    ownerSafe: true,
    rowSecurity: true,
    forceRowSecurity: true,
    relationOwnerExact: true,
    userTriggersAbsent: true,
    runtimeDatabaseConfigClean: true,
    parameterAclClean: true,
    runtimeMembershipCountExact: true,
    runtimeMembershipExact: true,
    runtimeHasNoMembers: true,
    ownerMembershipCountExact: true,
    schemaOwnerMembershipExact: true,
    ownerHasNoParentRole: true,
    ownerSetterExact: true,
    ownerCannotSetOtherRole: true,
    ownerSelectGranted: true,
    ownerInsertGranted: true,
    ownerUpdateGranted: true,
    ownerDeleteGranted: true,
    ownerTruncateDenied: true,
    ownerReferencesDenied: true,
    ownerTriggerDenied: true,
    runtimeSelectDenied: true,
    runtimeInsertDenied: true,
    runtimeUpdateDenied: true,
    runtimeDeleteDenied: true,
    profileSelectDenied: true,
    currentUserExecuteGranted: true,
    runtimeCurrentUserExecuteDenied: true,
    currentUserFunctionExact: true,
    statusExecuteGranted: true,
    anonymousStatusExecuteDenied: true,
    runtimeStatusExecuteDenied: true,
    statusFunctionExact: true,
  })
  requireExactState(
    {
      currentUserSource: result.rows[0]?.currentUserSource?.trim(),
      statusFunctionSource: result.rows[0]?.statusFunctionSource?.trim(),
    },
    {
      currentUserSource: expectedCurrentUserSource,
      statusFunctionSource: expectedAccessStatusSource,
    },
  )
}

async function requireDirectRuntimeDenied(runtime, text, values = []) {
  await runtime.query('BEGIN')
  try {
    let denied = false
    try {
      await runtime.query(text, values)
    } catch (error) {
      denied = error?.code === '42501'
    }
    if (!denied) throw new Error('trusted_child_runtime_direct_access_present')
  } finally {
    await runtime.query('ROLLBACK').catch(() => undefined)
  }
}

async function verifyOwnerBoundary(schemaOwner, runtime) {
  const ownerId = randomUUID()
  const foreignOwnerId = randomUUID()
  const ownerChildId = randomUUID()
  const foreignChildId = randomUUID()
  const missingChildId = randomUUID()
  const ownerCrudChildId = randomUUID()
  const directInsertChildId = randomUUID()
  const ownerName = randomUUID()
  const foreignName = randomUUID()
  const ownerCrudName = randomUUID()
  const ownerCrudUpdatedName = randomUUID()
  const foreignMutationName = randomUUID()

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
          ($1, $2, $3, DATE '2025-01-01', CURRENT_TIMESTAMP),
          ($4, $5, $6, DATE '2025-01-02', CURRENT_TIMESTAMP)
      `,
      [ownerChildId, ownerId, ownerName, foreignChildId, foreignOwnerId, foreignName],
    )

    await requireDirectRuntimeDenied(runtime, 'SELECT id FROM public.children WHERE id = $1', [
      ownerChildId,
    ])
    await requireDirectRuntimeDenied(
      runtime,
      `
        INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
        VALUES ($1, $2, $3, DATE '2025-01-03', CURRENT_TIMESTAMP)
      `,
      [directInsertChildId, ownerId, randomUUID()],
    )
    await requireDirectRuntimeDenied(
      runtime,
      'UPDATE public.children SET name = $1 WHERE id = $2',
      [foreignMutationName, ownerChildId],
    )
    await requireDirectRuntimeDenied(runtime, 'DELETE FROM public.children WHERE id = $1', [
      ownerChildId,
    ])

    await runtime.query('BEGIN')
    try {
      await runtime.query('SET LOCAL ROLE hana_child_owner')
      await runtime.query("SELECT set_config('hana.current_user_id', $1, true)", [ownerId])

      const currentUser = await runtime.query(
        'SELECT public.hana_current_user_id() AS "currentUserId"',
      )
      if (currentUser.rows[0]?.currentUserId !== ownerId) {
        throw new Error('trusted_child_rls_current_user_failed')
      }

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
        'UPDATE public.children SET name = $1 WHERE id = $2 RETURNING id',
        [foreignMutationName, foreignChildId],
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
            VALUES ($1, $2, $3, DATE '2025-01-05', CURRENT_TIMESTAMP)
          `,
          [randomUUID(), foreignOwnerId, randomUUID()],
        )
      } catch (error) {
        foreignInsertRejected = error?.code === '42501'
        await runtime.query('ROLLBACK TO SAVEPOINT foreign_insert')
      }
      if (!foreignInsertRejected) throw new Error('trusted_child_rls_insert_boundary_failed')

      let forbiddenRoleRejected = false
      await runtime.query('SAVEPOINT forbidden_role')
      try {
        await runtime.query('SET LOCAL ROLE pg_read_all_data')
      } catch (error) {
        forbiddenRoleRejected = error?.code === '42501'
      } finally {
        await runtime.query('ROLLBACK TO SAVEPOINT forbidden_role')
      }
      if (!forbiddenRoleRejected) throw new Error('trusted_child_rls_transitive_role_failed')

      await runtime.query('ROLLBACK')
    } catch (error) {
      await runtime.query('ROLLBACK').catch(() => undefined)
      throw error
    }

    await runtime.query('BEGIN')
    try {
      await runtime.query('SET LOCAL ROLE hana_child_owner')
      await runtime.query("SELECT set_config('hana.current_user_id', $1, true)", [ownerId])
      const ownerExistingUpdate = await runtime.query(
        'UPDATE public.children SET name = $1 WHERE id = $2 RETURNING id',
        [ownerCrudName, ownerChildId],
      )
      const ownerExistingDelete = await runtime.query(
        'DELETE FROM public.children WHERE id = $1 RETURNING id',
        [ownerChildId],
      )
      const ownerInsert = await runtime.query(
        `
          INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
          VALUES ($1, $2, $3, DATE '2025-01-04', CURRENT_TIMESTAMP)
          RETURNING id
        `,
        [ownerCrudChildId, ownerId, ownerCrudName],
      )
      const ownerUpdate = await runtime.query(
        'UPDATE public.children SET name = $1 WHERE id = $2 RETURNING id',
        [ownerCrudUpdatedName, ownerCrudChildId],
      )
      if (
        ownerExistingUpdate.rowCount !== 1 ||
        ownerExistingUpdate.rows[0]?.id !== ownerChildId ||
        ownerExistingDelete.rowCount !== 1 ||
        ownerExistingDelete.rows[0]?.id !== ownerChildId ||
        ownerInsert.rowCount !== 1 ||
        ownerInsert.rows[0]?.id !== ownerCrudChildId ||
        ownerUpdate.rowCount !== 1 ||
        ownerUpdate.rows[0]?.id !== ownerCrudChildId
      ) {
        throw new Error('trusted_child_rls_owner_crud_failed')
      }
      await runtime.query('COMMIT')
    } catch (error) {
      await runtime.query('ROLLBACK').catch(() => undefined)
      throw error
    }

    const persisted = await schemaOwner.query(
      `
        SELECT
          (SELECT count(*)::integer FROM public.children WHERE id = $1) AS "deletedCount",
          replacement.user_id AS "userId",
          replacement.name
        FROM public.children AS replacement
        WHERE replacement.id = $2
      `,
      [ownerChildId, ownerCrudChildId],
    )
    if (
      persisted.rowCount !== 1 ||
      persisted.rows[0]?.deletedCount !== 0 ||
      persisted.rows[0]?.userId !== ownerId ||
      persisted.rows[0]?.name !== ownerCrudUpdatedName
    ) {
      throw new Error('trusted_child_rls_owner_write_not_persisted')
    }

    await runtime.query('BEGIN')
    try {
      await runtime.query('SET LOCAL ROLE hana_child_owner')
      await runtime.query("SELECT set_config('hana.current_user_id', $1, true)", [ownerId])
      const ownerDelete = await runtime.query(
        'DELETE FROM public.children WHERE id = $1 RETURNING id',
        [ownerCrudChildId],
      )
      if (ownerDelete.rowCount !== 1 || ownerDelete.rows[0]?.id !== ownerCrudChildId) {
        throw new Error('trusted_child_rls_owner_crud_failed')
      }
      await runtime.query('COMMIT')
    } catch (error) {
      await runtime.query('ROLLBACK').catch(() => undefined)
      throw error
    }

    const deleted = await schemaOwner.query(
      'SELECT count(*)::integer AS count FROM public.children WHERE id = $1',
      [ownerCrudChildId],
    )
    if (deleted.rows[0]?.count !== 0) {
      throw new Error('trusted_child_rls_owner_delete_not_persisted')
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
