import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('cookie-only Route Handler authentication', () => {
  it('resolves users only through the request-scoped Supabase cookie client', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/server/auth/current-user.ts'),
      'utf8',
    )

    expect(source).toContain('createSupabaseServerClient()')
    expect(source).toContain('supabase.auth.getUser()')
    expect(source.toLowerCase()).not.toContain('authorization')
  })

  it('does not add Bearer credentials in the browser API client', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/lib/api/browser-client.ts'),
      'utf8',
    )

    expect(source).toContain("createApiClient({ baseUrl: '/v1' })")
    expect(source.toLowerCase()).not.toContain('authorization')
    expect(source).not.toContain('resolveAuthToken')
  })
})
