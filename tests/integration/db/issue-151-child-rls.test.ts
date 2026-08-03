import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

  const userAId = randomUUID()
  const userBId = randomUUID()
  const childAId = randomUUID()
  const childBId = randomUUID()

  beforeAll(async () => {
    assertIssue151DatabaseQaEnvironment(process.env)
    ;({ prisma } = await import('@/server/db/prisma'))
    ;({ getChildOwnerPrisma, disconnectChildOwnerPrisma } =
      await import('@/server/db/child-owner-prisma'))
    childPrisma = getChildOwnerPrisma()
    ;({ withChildOwnerScope, childAccessStatus } = await import('@/server/db/child-owner-scope'))

    await prisma.profile.createMany({
      data: [{ id: userAId }, { id: userBId }],
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
    await prisma.profile.deleteMany({ where: { id: { in: [userAId, userBId] } } })
    await disconnectChildOwnerPrisma?.()
    await prisma.$disconnect()
  })

  it('separates the non-superuser migrator, runtime, and owner roles', async () => {
    const [state] = await prisma.$queryRaw<
      Array<{
        migratorSuperuser: boolean
        migratorCreateRole: boolean
        migratorBypassRls: boolean
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
        childSelectGranted: boolean
        runtimeDirectChildSelectGranted: boolean
        profileSelectGranted: boolean
        statusExecuteGranted: boolean
        anonymousStatusExecuteGranted: boolean
        statusFunctionOwner: string
      }>
    >`
      SELECT
        migrator.rolsuper AS "migratorSuperuser",
        migrator.rolcreaterole AS "migratorCreateRole",
        migrator.rolbypassrls AS "migratorBypassRls",
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
      FROM pg_catalog.pg_roles AS migrator
      CROSS JOIN pg_catalog.pg_roles AS runtime
      CROSS JOIN pg_catalog.pg_roles AS owner
      JOIN pg_catalog.pg_class AS relation ON relation.relname = 'children'
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_proc AS status_function
        ON status_function.oid = 'public.hana_child_access_status(uuid)'::regprocedure
      WHERE migrator.rolname = 'hana_migrator'
        AND runtime.rolname = 'hana_child_runtime'
        AND owner.rolname = 'hana_child_owner'
        AND namespace.nspname = 'public'
    `

    expect(state).toEqual({
      migratorSuperuser: false,
      migratorCreateRole: true,
      migratorBypassRls: true,
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
      childSelectGranted: true,
      runtimeDirectChildSelectGranted: false,
      profileSelectGranted: false,
      statusExecuteGranted: true,
      anonymousStatusExecuteGranted: false,
      statusFunctionOwner: 'hana_migrator',
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
    await expect(
      withChildOwnerScope(userAId, (transaction) =>
        transaction.child.create({
          data: {
            id: randomUUID(),
            userId: userBId,
            name: 'synthetic-denied-insert',
            birthdate: new Date('2025-03-01T00:00:00Z'),
          },
        }),
      ),
    ).rejects.toThrow()
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

  it('fails closed on an orphaned upgrade, then proves handoff and rollback on existing rows', async () => {
    const migrationDirectory = 'prisma/migrations/20260803031500_add_child_rls_tracer'
    const rollbackSql = readFileSync(`${migrationDirectory}/rollback.sql`, 'utf8')
    const migrationSql = readFileSync(`${migrationDirectory}/migration.sql`, 'utf8')
    const handoffSql = readFileSync(
      `${migrationDirectory}/upgrade-handoff-from-postgres.sql`,
      'utf8',
    )
    const handoffRollbackSql = readFileSync(
      `${migrationDirectory}/upgrade-handoff-rollback-to-postgres.sql`,
      'utf8',
    )
    const orphanChildId = randomUUID()
    const orphanUserId = randomUUID()
    const admin = new Client({ connectionString: process.env.DATABASE_URL })
    const migrator = new Client({ connectionString: process.env.DIRECT_URL })

    await disconnectChildOwnerPrisma()
    await admin.connect()
    await migrator.connect()
    try {
      await migrator.query(rollbackSql)
      await admin.query('ALTER TABLE public.children OWNER TO postgres')
      await admin.query('ALTER TABLE public.profiles OWNER TO postgres')
      await admin.query('ALTER TABLE public.children DROP CONSTRAINT children_user_id_fkey')
      await admin.query(
        `INSERT INTO public.children (
          id, user_id, name, birthdate, created_at, updated_at
        ) VALUES ($1, $2, 'synthetic-orphan', DATE '2025-04-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [orphanChildId, orphanUserId],
      )

      await admin.query(handoffSql)
      await expect(migrator.query(migrationSql)).rejects.toThrow(/child_rls_preflight_orphan_owner/)
      await migrator.query('ROLLBACK')

      const failedState = await migrator.query<{
        ownerRoleCount: string
        rowSecurity: boolean
        forceRowSecurity: boolean
        currentUserFunction: string | null
        accessStatusFunction: string | null
      }>(`
        SELECT
          (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner')
            AS "ownerRoleCount",
          relation.relrowsecurity AS "rowSecurity",
          relation.relforcerowsecurity AS "forceRowSecurity",
          to_regprocedure('public.hana_current_user_id()')::text AS "currentUserFunction",
          to_regprocedure('public.hana_child_access_status(uuid)')::text AS "accessStatusFunction"
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = 'children'
      `)
      expect(failedState.rows[0]).toEqual({
        ownerRoleCount: '0',
        rowSecurity: false,
        forceRowSecurity: false,
        currentUserFunction: null,
        accessStatusFunction: null,
      })

      await admin.query('DELETE FROM public.children WHERE id = $1', [orphanChildId])
      await admin.query(`
        ALTER TABLE public.children
        ADD CONSTRAINT children_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id)
        ON DELETE CASCADE ON UPDATE CASCADE
      `)

      await migrator.query(migrationSql)
      const upgraded = await migrator.query<{
        childOwner: string
        profileOwner: string
        ownerRoleCount: string
        rowSecurity: boolean
        forceRowSecurity: boolean
        profileSelectGranted: boolean
      }>(`
        SELECT
          pg_get_userbyid(child_relation.relowner) AS "childOwner",
          pg_get_userbyid(profile_relation.relowner) AS "profileOwner",
          (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner')
            AS "ownerRoleCount",
          child_relation.relrowsecurity AS "rowSecurity",
          child_relation.relforcerowsecurity AS "forceRowSecurity",
          has_table_privilege('hana_migrator', 'public.profiles', 'SELECT')
            AS "profileSelectGranted"
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
      expect(upgraded.rows[0]).toEqual({
        childOwner: 'hana_migrator',
        profileOwner: 'postgres',
        ownerRoleCount: '1',
        rowSecurity: true,
        forceRowSecurity: true,
        profileSelectGranted: true,
      })

      childPrisma = getChildOwnerPrisma()
      await expect(
        withChildOwnerScope(userAId, (transaction) =>
          transaction.child.findUnique({ where: { id: childAId } }),
        ),
      ).resolves.toMatchObject({ id: childAId, userId: userAId })

      await disconnectChildOwnerPrisma()
      await migrator.query(rollbackSql)
      await admin.query(handoffRollbackSql)
      const rolledBack = await admin.query<{
        childOwner: string
        ownerRoleCount: string
        profileSelectGranted: boolean
      }>(`
        SELECT
          pg_get_userbyid(relation.relowner) AS "childOwner",
          (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner')
            AS "ownerRoleCount",
          has_table_privilege('hana_migrator', 'public.profiles', 'SELECT')
            AS "profileSelectGranted"
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = 'children'
      `)
      expect(rolledBack.rows[0]).toEqual({
        childOwner: 'postgres',
        ownerRoleCount: '0',
        profileSelectGranted: false,
      })

      await admin.query(handoffSql)
      await migrator.query(migrationSql)
    } finally {
      await admin.end()
      await migrator.end()
    }

    childPrisma = getChildOwnerPrisma()
    await expect(
      withChildOwnerScope(userAId, (transaction) =>
        transaction.child.findUnique({ where: { id: childAId } }),
      ),
    ).resolves.toMatchObject({ id: childAId, userId: userAId })
  })
})
