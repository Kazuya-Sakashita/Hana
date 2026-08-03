import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { assertIssue151DatabaseQaEnvironment } from '../../support/issue-151-environment'

const qaEnabled = process.env.ISSUE_151_DATABASE_QA === '1'

describe.skipIf(!qaEnabled)('ISSUE-151 child RLS on synthetic PostgreSQL', () => {
  let prisma: PrismaClient
  let withChildOwnerScope: typeof import('@/server/db/child-owner-scope').withChildOwnerScope
  let childAccessStatus: typeof import('@/server/db/child-owner-scope').childAccessStatus

  const userAId = randomUUID()
  const userBId = randomUUID()
  const childAId = randomUUID()
  const childBId = randomUUID()

  beforeAll(async () => {
    assertIssue151DatabaseQaEnvironment(process.env)
    ;({ prisma } = await import('@/server/db/prisma'))
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
    await prisma.$disconnect()
  })

  it('installs a non-login, non-bypass role and forced owner policy', async () => {
    const [state] = await prisma.$queryRaw<
      Array<{
        canLogin: boolean
        bypassRls: boolean
        inherits: boolean
        rowSecurity: boolean
        forceRowSecurity: boolean
        policyPresent: boolean
        runtimeCanSetRole: boolean
        childSelectGranted: boolean
        profileSelectGranted: boolean
        statusExecuteGranted: boolean
        anonymousStatusExecuteGranted: boolean
      }>
    >`
      SELECT
        role.rolcanlogin AS "canLogin",
        role.rolbypassrls AS "bypassRls",
        role.rolinherit AS "inherits",
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity",
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy AS policy
          WHERE policy.polrelid = relation.oid
            AND policy.polname = 'children_owner_scope'
        ) AS "policyPresent",
        pg_has_role(current_user, 'hana_child_owner', 'MEMBER') AS "runtimeCanSetRole",
        has_table_privilege('hana_child_owner', 'public.children', 'SELECT')
          AS "childSelectGranted",
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
        ) AS "anonymousStatusExecuteGranted"
      FROM pg_catalog.pg_roles AS role
      JOIN pg_catalog.pg_class AS relation ON relation.relname = 'children'
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE role.rolname = 'hana_child_owner'
        AND namespace.nspname = 'public'
    `

    expect(state).toEqual({
      canLogin: false,
      bypassRls: false,
      inherits: false,
      rowSecurity: true,
      forceRowSecurity: true,
      policyPresent: true,
      runtimeCanSetRole: true,
      childSelectGranted: true,
      profileSelectGranted: false,
      statusExecuteGranted: true,
      anonymousStatusExecuteGranted: false,
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
})
