import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  childFindFirst: vi.fn(),
  withChildOwnerScope: vi.fn(),
  childAccessStatus: vi.fn(),
}))

const transactionClient = {
  child: { findFirst: mocks.childFindFirst },
}

vi.mock('@/server/db/prisma', () => ({
  prisma: { $transaction: mocks.transaction },
}))

vi.mock('@/server/db/child-owner-scope', () => ({
  withChildOwnerScope: mocks.withChildOwnerScope,
  childAccessStatus: mocks.childAccessStatus,
}))

import { resolveChildOwnerScopeMode, withChildPersistence } from '@/server/db/child-persistence'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const CHILD_ID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'
const FOREIGN_USER_ID = '1d34a818-9a53-48db-a9c8-a1f40f6f0056'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CHILD_OWNER_SCOPE_MODE', 'route')
  vi.stubEnv('CHILD_DATABASE_URL', '')
  mocks.transaction.mockImplementation(
    async (operation: (transaction: typeof transactionClient) => Promise<unknown>) =>
      operation(transactionClient),
  )
  mocks.withChildOwnerScope.mockImplementation(
    async (
      _userId: string,
      operation: (transaction: typeof transactionClient) => Promise<unknown>,
    ) => operation(transactionClient),
  )
})

afterEach(() => vi.unstubAllEnvs())

describe('child persistence rollout mode', () => {
  it.each([
    [{}, 'route'],
    [{ CHILD_OWNER_SCOPE_MODE: '' }, 'route'],
    [{ CHILD_OWNER_SCOPE_MODE: 'route' }, 'route'],
    [
      {
        CHILD_OWNER_SCOPE_MODE: 'rls',
        CHILD_DATABASE_URL: 'postgresql://synthetic.invalid/hana_ci',
      },
      'rls',
    ],
  ] as const)('resolves the explicit mode from %j', (environment, expected) => {
    expect(resolveChildOwnerScopeMode(environment)).toBe(expected)
  })

  it('keeps CHILD_DATABASE_URL alone on the default route path', () => {
    expect(
      resolveChildOwnerScopeMode({ CHILD_DATABASE_URL: 'postgresql://synthetic.invalid/hana_ci' }),
    ).toBe('route')
  })

  it.each([
    [{ CHILD_OWNER_SCOPE_MODE: 'on' }, 'invalid_child_owner_scope_mode'],
    [{ CHILD_OWNER_SCOPE_MODE: 'rls' }, 'child_database_url_required_for_rls'],
  ])('rejects invalid cutover configuration without opening a transaction', async (env, reason) => {
    vi.stubEnv('CHILD_OWNER_SCOPE_MODE', env.CHILD_OWNER_SCOPE_MODE ?? '')
    const databaseUrl = Reflect.get(env, 'CHILD_DATABASE_URL')
    vi.stubEnv('CHILD_DATABASE_URL', typeof databaseUrl === 'string' ? databaseUrl : '')

    await expect(withChildPersistence(USER_ID, async () => null)).rejects.toThrow(reason)

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.withChildOwnerScope).not.toHaveBeenCalled()
  })

  it('uses the owner-filtered route transaction when cutover is off', async () => {
    mocks.childFindFirst.mockResolvedValue({ userId: FOREIGN_USER_ID })

    await expect(
      withChildPersistence(USER_ID, async (scope) => ({
        transaction: scope.transaction,
        status: await scope.accessStatus(CHILD_ID),
      })),
    ).resolves.toEqual({ transaction: transactionClient, status: 'foreign' })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.withChildOwnerScope).not.toHaveBeenCalled()
    expect(mocks.childFindFirst).toHaveBeenCalledWith({
      where: { id: CHILD_ID, deletedAt: null },
      select: { userId: true },
    })
  })

  it('uses only the RLS transaction when cutover is explicit', async () => {
    vi.stubEnv('CHILD_OWNER_SCOPE_MODE', 'rls')
    vi.stubEnv('CHILD_DATABASE_URL', 'postgresql://synthetic.invalid/hana_ci')
    mocks.childAccessStatus.mockResolvedValue('missing')

    await expect(
      withChildPersistence(USER_ID, (scope) => scope.accessStatus(CHILD_ID)),
    ).resolves.toBe('missing')

    expect(mocks.withChildOwnerScope).toHaveBeenCalledOnce()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.childAccessStatus).toHaveBeenCalledWith(transactionClient, CHILD_ID)
  })

  it('rejects an invalid user ID before either database path', async () => {
    await expect(withChildPersistence('not-a-uuid', async () => null)).rejects.toThrow(
      'invalid_child_owner_scope',
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.withChildOwnerScope).not.toHaveBeenCalled()
  })
})
