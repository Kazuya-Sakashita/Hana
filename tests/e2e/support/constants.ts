export const E2E_USER_ID = '00000000-0000-4000-8000-000000000140'
export const E2E_CHILD_ID = '00000000-0000-4000-8000-000000000141'
export const E2E_IMAGE_ID = '00000000-0000-4000-8000-000000000142'
export const E2E_RETRY_IMAGE_ID = '00000000-0000-4000-8000-000000000143'
export const E2E_ACCESS_TOKEN =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAxNDAiLCJleHAiOjQxMDI0NDQ4MDB9.synthetic'
export const E2E_REFRESH_TOKEN = 'synthetic-refresh-token-issue-140'
export const E2E_AUTH_COOKIE = 'sb-127-auth-token'

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
  is_anonymous: false,
}
