export const E2E_USER_ID = '00000000-0000-4000-8000-000000000140'
export const E2E_CHILD_ID = '00000000-0000-4000-8000-000000000141'
export const E2E_ACCESS_TOKEN =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAxNDAiLCJzZXNzaW9uX2lkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMTQyIiwiaXNzIjoiaHR0cDovLzEyNy4wLjAuMTo1NDMyMS9hdXRoL3YxIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6NDEwMjQ0NDgwMCwiaWF0IjoxNzg1NDU2MDAwLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEifQ.c3ludGhldGlj'
export const E2E_REFRESH_TOKEN = 'synthetic-refresh-token-issue-140'
export const E2E_AUTH_COOKIE = 'sb-127-auth-token'
export const E2E_FIXTURE_CONTROL_TOKEN = 'synthetic-fixture-control-issue-140'

interface SyntheticAuthUser {
  id: string
  aud: string
  role: string
  email: null
  app_metadata: { provider: string; providers: string[] }
  user_metadata: { fixture: string; padding: string }
  identities: unknown[]
  created_at: string
  updated_at: string
  last_sign_in_at: string
  is_anonymous: boolean
}

export const E2E_USER = {
  id: E2E_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: null,
  app_metadata: { provider: 'synthetic', providers: ['synthetic'] },
  user_metadata: { fixture: 'ISSUE-140', padding: 'x'.repeat(2_600) },
  identities: [],
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  last_sign_in_at: '2026-07-31T00:00:00.000Z',
  is_anonymous: false,
} satisfies SyntheticAuthUser
