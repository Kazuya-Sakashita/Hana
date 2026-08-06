import 'server-only'

import type { Prisma } from '@prisma/client'
import { getChildOwnerPrisma } from '@/server/db/child-owner-prisma'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ChildOwnerTransaction = Prisma.TransactionClient
export type ChildAccessStatus = 'owned' | 'foreign' | 'missing'

type ChildRuntimeSession = {
  sessionUser: string
  currentUser: string
  canLogin: boolean
  superuser: boolean
  createDatabase: boolean
  createRole: boolean
  inherits: boolean
  replication: boolean
  bypassRls: boolean
  configClean: boolean
  rowSecurityOn: boolean
  requestScopeClean: boolean
  membershipCount: number
  validOwnerMembership: boolean
}

async function assertChildRuntimeSession(transaction: ChildOwnerTransaction): Promise<void> {
  const rows = await transaction.$queryRaw<ChildRuntimeSession[]>`
    SELECT
      session_user::text AS "sessionUser",
      current_user::text AS "currentUser",
      runtime.rolcanlogin AS "canLogin",
      runtime.rolsuper AS "superuser",
      runtime.rolcreatedb AS "createDatabase",
      runtime.rolcreaterole AS "createRole",
      runtime.rolinherit AS "inherits",
      runtime.rolreplication AS "replication",
      runtime.rolbypassrls AS "bypassRls",
      COALESCE(cardinality(runtime.rolconfig), 0) = 0 AS "configClean",
      current_setting('row_security') = 'on' AS "rowSecurityOn",
      NULLIF(current_setting('hana.current_user_id', true), '') IS NULL
        AS "requestScopeClean",
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = runtime.oid
      ) AS "membershipCount",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS granted_role
          ON granted_role.oid = membership.roleid
        WHERE membership.member = runtime.oid
          AND granted_role.rolname = 'hana_child_owner'
          AND NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
      ) AS "validOwnerMembership"
    FROM pg_catalog.pg_roles AS runtime
    WHERE runtime.rolname = session_user
  `
  const session = rows[0]
  if (
    !session ||
    session.sessionUser !== 'hana_child_runtime' ||
    session.currentUser !== 'hana_child_runtime' ||
    !session.canLogin ||
    session.superuser ||
    session.createDatabase ||
    session.createRole ||
    session.inherits ||
    session.replication ||
    session.bypassRls ||
    !session.configClean ||
    !session.rowSecurityOn ||
    !session.requestScopeClean ||
    session.membershipCount !== 1 ||
    !session.validOwnerMembership
  ) {
    throw new Error('invalid_child_runtime_session')
  }
}

export async function withChildOwnerScope<T>(
  userId: string,
  operation: (transaction: ChildOwnerTransaction) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId)) throw new Error('invalid_child_owner_scope')

  return getChildOwnerPrisma().$transaction(async (transaction) => {
    await assertChildRuntimeSession(transaction)
    await transaction.$executeRawUnsafe('SET LOCAL ROLE hana_child_owner')
    await transaction.$queryRaw`SELECT set_config('hana.current_user_id', ${userId}, true)`
    return operation(transaction)
  })
}

export async function childAccessStatus(
  transaction: ChildOwnerTransaction,
  childId: string,
): Promise<ChildAccessStatus> {
  const rows = await transaction.$queryRaw<Array<{ accessStatus: string }>>`
    SELECT public.hana_child_access_status(${childId}::uuid) AS "accessStatus"
  `
  const status = rows[0]?.accessStatus
  if (status === 'owned' || status === 'foreign' || status === 'missing') return status
  throw new Error('invalid_child_access_status')
}
