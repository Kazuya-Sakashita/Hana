import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRawUnsafe: vi.fn(),
  queryRaw: vi.fn(),
}))

const transactionClient = {
  $executeRawUnsafe: mocks.executeRawUnsafe,
  $queryRaw: mocks.queryRaw,
}

vi.mock('@/server/db/child-owner-prisma', () => ({
  getChildOwnerPrisma: () => ({ $transaction: mocks.transaction }),
}))

import { childAccessStatus, withChildOwnerScope } from '@/server/db/child-owner-scope'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const CHILD_ID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.executeRawUnsafe.mockResolvedValue(0)
  mocks.queryRaw.mockResolvedValue([])
  mocks.transaction.mockImplementation(
    async (operation: (transaction: typeof transactionClient) => Promise<unknown>) =>
      operation(transactionClient),
  )
})

describe('child owner DB scope', () => {
  it('sets a fixed local role and parameterized request user inside one transaction', async () => {
    const operation = vi.fn().mockResolvedValue('ok')

    await expect(withChildOwnerScope(USER_ID, operation)).resolves.toBe('ok')

    expect(mocks.executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE hana_child_owner')
    const [queryParts, parameter] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray, string]
    expect(queryParts.join('?')).toContain("set_config('hana.current_user_id', ?")
    expect(parameter).toBe(USER_ID)
    expect(operation).toHaveBeenCalledWith(transactionClient)
  })

  it('rejects an invalid user scope before opening a transaction', async () => {
    await expect(withChildOwnerScope('not-a-uuid', async () => null)).rejects.toThrow(
      'invalid_child_owner_scope',
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each(['owned', 'foreign', 'missing'] as const)(
    'accepts the allowlisted access status %s',
    async (status) => {
      mocks.queryRaw.mockResolvedValue([{ accessStatus: status }])
      await expect(childAccessStatus(transactionClient as never, CHILD_ID)).resolves.toBe(status)
    },
  )

  it('fails closed on an unexpected access status', async () => {
    mocks.queryRaw.mockResolvedValue([{ accessStatus: 'unexpected' }])
    await expect(childAccessStatus(transactionClient as never, CHILD_ID)).rejects.toThrow(
      'invalid_child_access_status',
    )
  })

  it('keeps normal child CRUD routes off the privileged Prisma client', () => {
    for (const file of ['src/app/v1/children/route.ts', 'src/app/v1/children/[childId]/route.ts']) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain("from '@/server/db/child-owner-scope'")
      expect(source).not.toContain("from '@/server/db/prisma'")
      expect(source).not.toContain("from '@/server/db/child-owner-prisma'")
    }
  })

  it('keeps forward, rollback, and CI contracts together', () => {
    const migrationDirectory = 'prisma/migrations/20260803031500_add_child_rls_tracer'
    const migration = readFileSync(`${migrationDirectory}/migration.sql`, 'utf8')
    const rollback = readFileSync(`${migrationDirectory}/rollback.sql`, 'utf8')
    const handoff = readFileSync(`${migrationDirectory}/upgrade-handoff-from-postgres.sql`, 'utf8')
    const handoffRollback = readFileSync(
      `${migrationDirectory}/upgrade-handoff-rollback-to-postgres.sql`,
      'utf8',
    )
    const workflow = readFileSync('.github/workflows/typecheck.yml', 'utf8')

    expect(migration.trimStart()).toContain('BEGIN;')
    expect(migration).toContain('child_rls_preflight_migrator_role_required')
    expect(migration).toContain('child_rls_preflight_runtime_role_required')
    expect(migration).toContain('child_rls_preflight_upgrade_handoff_required')
    expect(migration).toContain('child_rls_preflight_orphan_owner')
    expect(migration).toContain('child_rls_preflight_role_already_exists')
    expect(migration).toContain('CREATE ROLE hana_child_owner')
    expect(migration).toContain('NOBYPASSRLS')
    expect(migration).toContain('GRANT hana_child_owner TO hana_child_runtime')
    expect(migration).toContain(
      'ALTER FUNCTION public.hana_child_access_status(uuid) OWNER TO hana_migrator',
    )
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('WITH CHECK (user_id = public.hana_current_user_id())')
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(rollback).toContain('DROP POLICY children_owner_scope ON public.children')
    expect(rollback).toContain('REVOKE hana_child_owner FROM hana_child_runtime')
    expect(rollback).toContain('DROP ROLE hana_child_owner')
    expect(handoff).toContain('ALTER TABLE public.children OWNER TO hana_migrator')
    expect(handoff).toContain('GRANT SELECT ON TABLE public.profiles TO hana_migrator')
    expect(handoffRollback).toContain('ALTER TABLE public.children OWNER TO postgres')
    expect(handoffRollback).toContain('REVOKE SELECT ON TABLE public.profiles FROM hana_migrator')
    expect(workflow).toContain('pnpm qa:issue151:db-bootstrap')
    expect(workflow).toContain('CHILD_DATABASE_URL: postgresql://hana_child_runtime:')
    expect(workflow).toContain('pnpm qa:issue151:child-rls-db')
  })
})
