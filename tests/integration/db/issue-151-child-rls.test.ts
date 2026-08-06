import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'
import { Client } from 'pg'
import { assertIssue151DatabaseQaEnvironment } from '../../support/issue-151-environment'

const qaEnabled = process.env.ISSUE_151_DATABASE_QA === '1'

describe.skipIf(!qaEnabled)('ISSUE-151 child RLS on synthetic PostgreSQL', () => {
  let prisma: PrismaClient
  let childPrisma: PrismaClient
  let getChildOwnerPrisma: typeof import('@/server/db/child-owner-prisma').getChildOwnerPrisma
  let disconnectChildOwnerPrisma: typeof import('@/server/db/child-owner-prisma').disconnectChildOwnerPrisma
  let withChildOwnerScope: typeof import('@/server/db/child-owner-scope').withChildOwnerScope
  let childAccessStatus: typeof import('@/server/db/child-owner-scope').childAccessStatus
  let withChildPersistence: typeof import('@/server/db/child-persistence').withChildPersistence

  const userAId = randomUUID()
  const userBId = randomUUID()
  const userCId = randomUUID()
  const childAId = randomUUID()
  const childBId = randomUUID()

  beforeAll(async () => {
    assertIssue151DatabaseQaEnvironment(process.env)
    ;({ prisma } = await import('@/server/db/prisma'))
    ;({ getChildOwnerPrisma, disconnectChildOwnerPrisma } =
      await import('@/server/db/child-owner-prisma'))
    childPrisma = getChildOwnerPrisma()
    ;({ withChildOwnerScope, childAccessStatus } = await import('@/server/db/child-owner-scope'))
    ;({ withChildPersistence } = await import('@/server/db/child-persistence'))

    await prisma.profile.createMany({
      data: [{ id: userAId }, { id: userBId }, { id: userCId }],
    })
    await prisma.child.createMany({
      data: [
        {
          id: childAId,
          userId: userAId,
          name: 'synthetic-a',
          birthdate: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: childBId,
          userId: userBId,
          name: 'synthetic-b',
          birthdate: new Date('2025-02-01T00:00:00Z'),
        },
      ],
    })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.profile.deleteMany({ where: { id: { in: [userAId, userBId, userCId] } } })
    await disconnectChildOwnerPrisma?.()
    await prisma.$disconnect()
  })

  it('separates the non-superuser schema owner, runtime, and request owner roles', async () => {
    const [state] = await prisma.$queryRaw<
      Array<{
        schemaOwnerSuperuser: boolean
        schemaOwnerCreateRole: boolean
        schemaOwnerBypassRls: boolean
        runtimeSuperuser: boolean
        runtimeBypassRls: boolean
        runtimeInherits: boolean
        ownerCanLogin: boolean
        ownerBypassRls: boolean
        ownerInherits: boolean
        rowSecurity: boolean
        forceRowSecurity: boolean
        policyPresent: boolean
        runtimeCanSetRole: boolean
        runtimeMembershipCount: number
        runtimeMembershipExact: boolean
        ownerMemberCount: number
        schemaOwnerMembershipExact: boolean
        childSelectGranted: boolean
        runtimeDirectChildSelectGranted: boolean
        profileSelectGranted: boolean
        statusExecuteGranted: boolean
        anonymousStatusExecuteGranted: boolean
        statusFunctionOwner: string
      }>
    >`
      SELECT
        schema_owner.rolsuper AS "schemaOwnerSuperuser",
        schema_owner.rolcreaterole AS "schemaOwnerCreateRole",
        schema_owner.rolbypassrls AS "schemaOwnerBypassRls",
        runtime.rolsuper AS "runtimeSuperuser",
        runtime.rolbypassrls AS "runtimeBypassRls",
        runtime.rolinherit AS "runtimeInherits",
        owner.rolcanlogin AS "ownerCanLogin",
        owner.rolbypassrls AS "ownerBypassRls",
        owner.rolinherit AS "ownerInherits",
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity",
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy AS policy
          WHERE policy.polrelid = relation.oid
            AND policy.polname = 'children_owner_scope'
        ) AS "policyPresent",
        pg_has_role('hana_child_runtime', 'hana_child_owner', 'SET') AS "runtimeCanSetRole",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = runtime.oid
        ) AS "runtimeMembershipCount",
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
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
        ) AS "ownerMemberCount",
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = schema_owner.oid
            AND membership.roleid = owner.oid
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
        ) AS "schemaOwnerMembershipExact",
        has_table_privilege('hana_child_owner', 'public.children', 'SELECT')
          AS "childSelectGranted",
        has_table_privilege('hana_child_runtime', 'public.children', 'SELECT')
          AS "runtimeDirectChildSelectGranted",
        has_table_privilege('hana_child_owner', 'public.profiles', 'SELECT')
          AS "profileSelectGranted",
        has_function_privilege(
          'hana_child_owner',
          'public.hana_child_access_status(uuid)',
          'EXECUTE'
        ) AS "statusExecuteGranted",
        has_function_privilege(
          'anon',
          'public.hana_child_access_status(uuid)',
          'EXECUTE'
        ) AS "anonymousStatusExecuteGranted",
        pg_get_userbyid(status_function.proowner) AS "statusFunctionOwner"
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
    `

    expect(state).toEqual({
      schemaOwnerSuperuser: false,
      schemaOwnerCreateRole: true,
      schemaOwnerBypassRls: true,
      runtimeSuperuser: false,
      runtimeBypassRls: false,
      runtimeInherits: false,
      ownerCanLogin: false,
      ownerBypassRls: false,
      ownerInherits: false,
      rowSecurity: true,
      forceRowSecurity: true,
      policyPresent: true,
      runtimeCanSetRole: true,
      runtimeMembershipCount: 1,
      runtimeMembershipExact: true,
      ownerMemberCount: 2,
      schemaOwnerMembershipExact: true,
      childSelectGranted: true,
      runtimeDirectChildSelectGranted: false,
      profileSelectGranted: false,
      statusExecuteGranted: true,
      anonymousStatusExecuteGranted: false,
      statusFunctionOwner: 'postgres',
    })
  })

  async function readSessionState(client: PrismaClient | Prisma.TransactionClient) {
    const [state] = await client.$queryRaw<
      Array<{
        backendPid: number
        currentUser: string
        currentRole: string
        requestUserId: string | null
      }>
    >`
      SELECT
        pg_backend_pid() AS "backendPid",
        current_user AS "currentUser",
        current_role AS "currentRole",
        NULLIF(current_setting('hana.current_user_id', true), '') AS "requestUserId"
    `
    if (!state) throw new Error('issue_151_session_state_missing')
    return state
  }

  it('keeps a provisioned secret on the route path until RLS mode is explicit', async () => {
    const previousMode = process.env.CHILD_OWNER_SCOPE_MODE
    try {
      delete process.env.CHILD_OWNER_SCOPE_MODE
      const routeState = await withChildPersistence(userAId, ({ transaction }) =>
        readSessionState(transaction),
      )
      expect(routeState).toMatchObject({
        currentUser: 'hana_admin',
        currentRole: 'hana_admin',
        requestUserId: null,
      })

      process.env.CHILD_OWNER_SCOPE_MODE = 'rls'
      const rlsState = await withChildPersistence(userAId, ({ transaction }) =>
        readSessionState(transaction),
      )
      expect(rlsState).toMatchObject({
        currentUser: 'hana_child_owner',
        currentRole: 'hana_child_owner',
        requestUserId: userAId,
      })
    } finally {
      if (previousMode === undefined) delete process.env.CHILD_OWNER_SCOPE_MODE
      else process.env.CHILD_OWNER_SCOPE_MODE = previousMode
    }
  })

  it('rejects a privileged credential even when RLS mode and a URL are present', async () => {
    const runtimeUrl = process.env.CHILD_DATABASE_URL
    const schemaOwnerUrl = process.env.DIRECT_URL
    if (!runtimeUrl || !schemaOwnerUrl) throw new Error('issue_180_database_url_missing')

    await disconnectChildOwnerPrisma()
    process.env.CHILD_DATABASE_URL = schemaOwnerUrl
    try {
      await expect(
        withChildOwnerScope(userAId, (transaction) =>
          transaction.child.findUnique({ where: { id: childAId } }),
        ),
      ).rejects.toThrow('invalid_child_runtime_session')
    } finally {
      await disconnectChildOwnerPrisma()
      process.env.CHILD_DATABASE_URL = runtimeUrl
      childPrisma = getChildOwnerPrisma()
    }
  })

  it('rejects unsafe database settings and parameter privileges before setting owner scope', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL })
    await disconnectChildOwnerPrisma()
    await admin.connect()
    try {
      await admin.query('GRANT SET ON PARAMETER session_replication_role TO hana_child_runtime')
      await admin.query(`
        ALTER ROLE hana_child_runtime IN DATABASE hana_ci
        SET session_replication_role = 'replica'
      `)

      await expect(
        withChildOwnerScope(userAId, (transaction) =>
          transaction.child.findUnique({ where: { id: childAId } }),
        ),
      ).rejects.toThrow('invalid_child_runtime_session')
    } finally {
      await disconnectChildOwnerPrisma()
      await admin
        .query('ALTER ROLE hana_child_runtime IN DATABASE hana_ci RESET ALL')
        .catch(() => undefined)
      await admin
        .query('REVOKE SET ON PARAMETER session_replication_role FROM hana_child_runtime')
        .catch(() => undefined)
      await admin.end()
      childPrisma = getChildOwnerPrisma()
    }
  })

  it('rejects parameter privileges inherited from PUBLIC or the request owner role', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL })
    const inheritedRole = 'issue_181_parameter_group'
    await disconnectChildOwnerPrisma()
    await admin.connect()
    try {
      for (const grantee of ['PUBLIC', 'hana_child_owner']) {
        await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${grantee}`)
        try {
          await expect(
            withChildOwnerScope(userAId, (transaction) =>
              transaction.child.findUnique({ where: { id: childAId } }),
            ),
          ).rejects.toThrow('invalid_child_runtime_session')
        } finally {
          await disconnectChildOwnerPrisma()
          await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${grantee}`)
        }
      }

      await admin.query(`CREATE ROLE ${inheritedRole} NOLOGIN`)
      await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${inheritedRole}`)
      await admin.query(`
        GRANT ${inheritedRole} TO hana_child_owner
        WITH ADMIN FALSE, INHERIT TRUE, SET FALSE
      `)
      const operation = vi.fn()
      await expect(withChildOwnerScope(userAId, operation)).rejects.toThrow(
        'invalid_child_runtime_session',
      )
      expect(operation).not.toHaveBeenCalled()
    } finally {
      await disconnectChildOwnerPrisma()
      await admin.query(`REVOKE ${inheritedRole} FROM hana_child_owner`).catch(() => undefined)
      await admin
        .query(`REVOKE SET ON PARAMETER session_replication_role FROM ${inheritedRole}`)
        .catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${inheritedRole}`).catch(() => undefined)
      await admin
        .query('REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC')
        .catch(() => undefined)
      await admin
        .query('REVOKE SET ON PARAMETER session_replication_role FROM hana_child_owner')
        .catch(() => undefined)
      await admin.end()
      childPrisma = getChildOwnerPrisma()
    }
  })

  it('resets the role and request user on the same connection after commit', async () => {
    const before = await readSessionState(childPrisma)
    const inside = await withChildOwnerScope(userAId, (transaction) =>
      readSessionState(transaction),
    )
    const after = await readSessionState(childPrisma)

    expect([before.backendPid, inside.backendPid, after.backendPid]).toEqual([
      before.backendPid,
      before.backendPid,
      before.backendPid,
    ])
    expect(before).toMatchObject({
      currentUser: 'hana_child_runtime',
      currentRole: 'hana_child_runtime',
      requestUserId: null,
    })
    expect(inside).toMatchObject({
      currentUser: 'hana_child_owner',
      currentRole: 'hana_child_owner',
      requestUserId: userAId,
    })
    expect(after).toMatchObject({
      currentUser: 'hana_child_runtime',
      currentRole: 'hana_child_runtime',
      requestUserId: null,
    })
  })

  it('resets the role and request user on the same connection after rollback', async () => {
    const before = await readSessionState(childPrisma)
    let inside: Awaited<ReturnType<typeof readSessionState>> | undefined

    await expect(
      withChildOwnerScope(userAId, async (transaction) => {
        inside = await readSessionState(transaction)
        throw new Error('synthetic_scope_rollback')
      }),
    ).rejects.toThrow('synthetic_scope_rollback')

    const after = await readSessionState(childPrisma)
    expect(inside).toBeDefined()
    expect([before.backendPid, inside?.backendPid, after.backendPid]).toEqual([
      before.backendPid,
      before.backendPid,
      before.backendPid,
    ])
    expect(after).toMatchObject({
      currentUser: 'hana_child_runtime',
      currentRole: 'hana_child_runtime',
      requestUserId: null,
    })
  })

  it('returns only the request owner row and preserves the existing foreign status contract', async () => {
    const result = await withChildOwnerScope(userAId, async (transaction) => ({
      rows: await transaction.child.findMany({ orderBy: { id: 'asc' } }),
      foreignStatus: await childAccessStatus(transaction, childBId),
    }))

    expect(result.rows.map((child) => child.id)).toEqual([childAId])
    expect(result.foreignStatus).toBe('foreign')
  })

  it('rejects User A reads, updates, and deletes against User B at the database layer', async () => {
    const denied = await withChildOwnerScope(userAId, async (transaction) => ({
      read: await transaction.child.findUnique({ where: { id: childBId } }),
      updated: await transaction.child.updateMany({
        where: { id: childBId },
        data: { name: 'synthetic-denied-update' },
      }),
      deleted: await transaction.child.deleteMany({ where: { id: childBId } }),
    }))

    expect(denied).toEqual({ read: null, updated: { count: 0 }, deleted: { count: 0 } })
    await expect(
      prisma.child.findUniqueOrThrow({ where: { id: childBId } }),
    ).resolves.toMatchObject({ name: 'synthetic-b', deletedAt: null })
  })

  it('rejects inserting a row for another owner', async () => {
    const deniedChildId = randomUUID()
    await expect(
      withChildOwnerScope(
        userAId,
        (transaction) =>
          transaction.$executeRaw`
          INSERT INTO public.children (id, user_id, name, birthdate, updated_at)
          VALUES (
            ${deniedChildId}::uuid,
            ${userCId}::uuid,
            'synthetic-denied-insert',
            DATE '2025-03-01',
            CURRENT_TIMESTAMP
          )
        `,
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: expect.objectContaining({
        driverAdapterError: expect.objectContaining({
          cause: expect.objectContaining({
            code: '42501',
            message: expect.stringContaining('row-level security policy'),
          }),
        }),
      }),
    })
    await expect(prisma.child.findUnique({ where: { id: deniedChildId } })).resolves.toBeNull()
  })

  it('cannot read tables outside the tracer resource grant', async () => {
    await expect(
      withChildOwnerScope(
        userAId,
        (transaction) => transaction.$queryRaw`SELECT id FROM public.profiles LIMIT 1`,
      ),
    ).rejects.toThrow()
  })

  it('allows owner updates and rolls them back when the request transaction fails', async () => {
    await expect(
      withChildOwnerScope(userAId, async (transaction) => {
        await transaction.child.update({
          where: { id: childAId },
          data: { name: 'synthetic-rolled-back' },
        })
        throw new Error('synthetic_scope_rollback')
      }),
    ).rejects.toThrow('synthetic_scope_rollback')

    await expect(
      prisma.child.findUniqueOrThrow({ where: { id: childAId } }),
    ).resolves.toMatchObject({ name: 'synthetic-a' })
  })

  it('fails before changing an orphaned database, then preserves ownership through upgrade and rollback', async () => {
    const migrationDirectory = 'prisma/migrations/20260803031500_add_child_rls_tracer'
    const rollbackSql = readFileSync(`${migrationDirectory}/rollback.sql`, 'utf8')
    const migrationSql = readFileSync(`${migrationDirectory}/migration.sql`, 'utf8')
    const orphanChildId = randomUUID()
    const orphanUserId = randomUUID()
    const inheritedRuntimeRole = 'issue_181_runtime_parameter_group'
    const admin = new Client({ connectionString: process.env.DATABASE_URL })
    const schemaOwner = new Client({ connectionString: process.env.DIRECT_URL })

    async function readMigrationState(client: Client) {
      const result = await client.query<{
        childOwner: string
        profileOwner: string
        childAcl: string | null
        profileAcl: string | null
        ownerRoleCount: string
        rowSecurity: boolean
        forceRowSecurity: boolean
        currentUserFunction: string | null
        accessStatusFunction: string | null
        accessStatusFunctionOwner: string | null
      }>(`
        SELECT
          pg_get_userbyid(child_relation.relowner) AS "childOwner",
          pg_get_userbyid(profile_relation.relowner) AS "profileOwner",
          child_relation.relacl::text AS "childAcl",
          profile_relation.relacl::text AS "profileAcl",
          (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner')
            AS "ownerRoleCount",
          child_relation.relrowsecurity AS "rowSecurity",
          child_relation.relforcerowsecurity AS "forceRowSecurity",
          to_regprocedure('public.hana_current_user_id()')::text AS "currentUserFunction",
          to_regprocedure('public.hana_child_access_status(uuid)')::text
            AS "accessStatusFunction",
          (
            SELECT pg_get_userbyid(procedure.proowner)
            FROM pg_catalog.pg_proc AS procedure
            WHERE procedure.oid = to_regprocedure('public.hana_child_access_status(uuid)')
          ) AS "accessStatusFunctionOwner"
        FROM pg_catalog.pg_class AS child_relation
        JOIN pg_catalog.pg_namespace AS child_namespace
          ON child_namespace.oid = child_relation.relnamespace
        CROSS JOIN pg_catalog.pg_class AS profile_relation
        JOIN pg_catalog.pg_namespace AS profile_namespace
          ON profile_namespace.oid = profile_relation.relnamespace
        WHERE child_namespace.nspname = 'public'
          AND child_relation.relname = 'children'
          AND profile_namespace.nspname = 'public'
          AND profile_relation.relname = 'profiles'
      `)
      const state = result.rows[0]
      if (!state) throw new Error('issue_151_migration_state_missing')
      return state
    }

    async function readMigrationHistory(client: Client) {
      const result = await client.query<{
        migrationName: string
        checksum: string
        finishedAt: string
        rolledBackAt: string | null
        appliedStepsCount: number
      }>(`
        SELECT
          migration_name AS "migrationName",
          checksum,
          finished_at::text AS "finishedAt",
          rolled_back_at::text AS "rolledBackAt",
          applied_steps_count AS "appliedStepsCount"
        FROM public._prisma_migrations
        WHERE migration_name = '20260803031500_add_child_rls_tracer'
      `)
      return result.rows
    }

    async function readRuntimeRiskState(client: Client) {
      const result = await client.query<{
        databaseSettingCount: number
        parameterAclCount: number
        riskyDatabaseAclCount: number
      }>(`
        SELECT
          (
            SELECT count(*)::integer
            FROM pg_catalog.pg_db_role_setting AS database_setting
            WHERE database_setting.setrole = runtime.oid
          ) AS "databaseSettingCount",
          (
            SELECT count(*)::integer
            FROM pg_catalog.pg_parameter_acl AS parameter
            CROSS JOIN LATERAL aclexplode(parameter.paracl) AS acl
            WHERE acl.grantee IN (0, runtime.oid)
          ) AS "parameterAclCount",
          (
            SELECT count(*)::integer
            FROM pg_catalog.pg_database AS database
            CROSS JOIN LATERAL aclexplode(database.datacl) AS acl
            WHERE acl.grantee = runtime.oid
              AND (
                database.datname <> current_database()
                OR acl.privilege_type <> 'CONNECT'
                OR acl.is_grantable
              )
          ) AS "riskyDatabaseAclCount"
        FROM pg_catalog.pg_roles AS runtime
        WHERE runtime.rolname = 'hana_child_runtime'
      `)
      const state = result.rows[0]
      if (!state) throw new Error('issue_180_runtime_risk_state_missing')
      return state
    }

    await disconnectChildOwnerPrisma()
    await admin.connect()
    await schemaOwner.connect()
    try {
      const appliedHistory = await readMigrationHistory(schemaOwner)
      expect(appliedHistory).toHaveLength(1)
      expect(appliedHistory[0]).toMatchObject({
        migrationName: '20260803031500_add_child_rls_tracer',
        rolledBackAt: null,
        appliedStepsCount: 1,
      })

      await schemaOwner.query(rollbackSql)
      const baseline = await readMigrationState(schemaOwner)
      expect(baseline).toMatchObject({
        childOwner: 'postgres',
        profileOwner: 'postgres',
        ownerRoleCount: '0',
        rowSecurity: false,
        forceRowSecurity: false,
        currentUserFunction: null,
        accessStatusFunction: null,
        accessStatusFunctionOwner: null,
      })

      execFileSync('pnpm', ['db:migrate:deploy'], {
        cwd: process.cwd(),
        env: { ...process.env, DIRECT_URL: process.env.DIRECT_URL },
        stdio: 'ignore',
      })
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(readMigrationHistory(schemaOwner)).resolves.toEqual(appliedHistory)

      await admin.query('GRANT SELECT ON TABLE public.children TO hana_child_runtime')
      const directAclState = await readMigrationState(schemaOwner)
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_direct_acl_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(directAclState)
      await admin.query('REVOKE SELECT ON TABLE public.children FROM hana_child_runtime')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)

      const cleanRuntimeRiskState = await readRuntimeRiskState(admin)
      expect(cleanRuntimeRiskState).toEqual({
        databaseSettingCount: 0,
        parameterAclCount: 0,
        riskyDatabaseAclCount: 0,
      })

      await admin.query(`
        ALTER ROLE hana_child_runtime IN DATABASE hana_ci
        SET statement_timeout = '30s'
      `)
      const databaseSettingState = await readRuntimeRiskState(admin)
      expect(databaseSettingState.databaseSettingCount).toBe(1)
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_database_setting_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(databaseSettingState)
      await admin.query('ALTER ROLE hana_child_runtime IN DATABASE hana_ci RESET ALL')
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(cleanRuntimeRiskState)

      await admin.query('GRANT SET ON PARAMETER session_replication_role TO hana_child_runtime')
      const parameterAclState = await readRuntimeRiskState(admin)
      expect(parameterAclState.parameterAclCount).toBe(1)
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_parameter_acl_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(parameterAclState)
      await admin.query('REVOKE SET ON PARAMETER session_replication_role FROM hana_child_runtime')
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(cleanRuntimeRiskState)

      await admin.query('GRANT SET ON PARAMETER session_replication_role TO PUBLIC')
      const publicParameterAclState = await readRuntimeRiskState(admin)
      expect(publicParameterAclState.parameterAclCount).toBe(1)
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_parameter_acl_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(publicParameterAclState)
      await admin.query('REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC')
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(cleanRuntimeRiskState)

      await admin.query(`CREATE ROLE ${inheritedRuntimeRole} NOLOGIN`)
      await admin.query(
        `GRANT SET ON PARAMETER session_replication_role TO ${inheritedRuntimeRole}`,
      )
      await admin.query(`
        GRANT ${inheritedRuntimeRole} TO hana_child_runtime
        WITH ADMIN FALSE, INHERIT TRUE, SET FALSE
      `)
      await expect(
        admin.query<{ effective: boolean }>(`
          SELECT has_parameter_privilege(
            'hana_child_runtime',
            'session_replication_role',
            'SET'
          ) AS effective
        `),
      ).resolves.toMatchObject({ rows: [{ effective: true }] })
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_parameter_acl_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(
        admin.query<{ effective: boolean }>(`
          SELECT has_parameter_privilege(
            'hana_child_runtime',
            'session_replication_role',
            'SET'
          ) AS effective
        `),
      ).resolves.toMatchObject({ rows: [{ effective: true }] })
      await admin.query(`REVOKE ${inheritedRuntimeRole} FROM hana_child_runtime`)
      await admin.query(
        `REVOKE SET ON PARAMETER session_replication_role FROM ${inheritedRuntimeRole}`,
      )
      await admin.query(`DROP ROLE ${inheritedRuntimeRole}`)
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(cleanRuntimeRiskState)

      await admin.query('GRANT CONNECT ON DATABASE postgres TO hana_child_runtime')
      const otherDatabaseAclState = await readRuntimeRiskState(admin)
      expect(otherDatabaseAclState.riskyDatabaseAclCount).toBe(1)
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_direct_acl_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(otherDatabaseAclState)
      await admin.query('REVOKE CONNECT ON DATABASE postgres FROM hana_child_runtime')
      await expect(readRuntimeRiskState(admin)).resolves.toEqual(cleanRuntimeRiskState)

      await admin.query('CREATE TABLE public.issue_180_runtime_owned_probe (id integer)')
      await admin.query(
        'ALTER TABLE public.issue_180_runtime_owned_probe OWNER TO hana_child_runtime',
      )
      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_runtime_object_owner_present/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(
        admin.query<{ owner: string }>(`
          SELECT pg_get_userbyid(relation.relowner) AS owner
          FROM pg_catalog.pg_class AS relation
          WHERE relation.oid = 'public.issue_180_runtime_owned_probe'::regclass
        `),
      ).resolves.toMatchObject({ rows: [{ owner: 'hana_child_runtime' }] })
      await admin.query('DROP TABLE public.issue_180_runtime_owned_probe')

      await admin.query('ALTER TABLE public.children DROP CONSTRAINT children_user_id_fkey')
      await admin.query(
        `INSERT INTO public.children (
          id, user_id, name, birthdate, created_at, updated_at
        ) VALUES ($1, $2, 'synthetic-orphan', DATE '2025-04-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [orphanChildId, orphanUserId],
      )

      await expect(schemaOwner.query(migrationSql)).rejects.toThrow(
        /child_rls_preflight_orphan_owner/,
      )
      await schemaOwner.query('ROLLBACK')
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)

      await admin.query('DELETE FROM public.children WHERE id = $1', [orphanChildId])
      await admin.query(`
        ALTER TABLE public.children
        ADD CONSTRAINT children_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id)
        ON DELETE CASCADE ON UPDATE CASCADE
      `)

      await schemaOwner.query(migrationSql)
      await expect(readMigrationState(schemaOwner)).resolves.toMatchObject({
        childOwner: 'postgres',
        profileOwner: 'postgres',
        ownerRoleCount: '1',
        rowSecurity: true,
        forceRowSecurity: true,
        currentUserFunction: 'hana_current_user_id()',
        accessStatusFunction: 'hana_child_access_status(uuid)',
        accessStatusFunctionOwner: 'postgres',
      })

      childPrisma = getChildOwnerPrisma()
      await expect(
        withChildOwnerScope(userAId, (transaction) =>
          transaction.child.findUnique({ where: { id: childAId } }),
        ),
      ).resolves.toMatchObject({ id: childAId, userId: userAId })

      await disconnectChildOwnerPrisma()
      await schemaOwner.query(rollbackSql)
      await expect(readMigrationState(schemaOwner)).resolves.toEqual(baseline)
      await schemaOwner.query(migrationSql)
      await expect(readMigrationHistory(schemaOwner)).resolves.toEqual(appliedHistory)
    } finally {
      await admin.end()
      await schemaOwner.end()
    }

    childPrisma = getChildOwnerPrisma()
    await expect(
      withChildOwnerScope(userAId, (transaction) =>
        transaction.child.findUnique({ where: { id: childAId } }),
      ),
    ).resolves.toMatchObject({ id: childAId, userId: userAId })
  })
})
