import { defineConfig, devices } from '@playwright/test'
import { authStatePath } from './tests/e2e/global-setup'
import { assertSyntheticE2eEnvironment } from './tests/e2e/support/environment'

const { databaseUrl, directUrl } = assertSyntheticE2eEnvironment(process.env)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    storageState: authStatePath,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/issue-140',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/e2e/support/fake-supabase-auth.mjs',
      url: 'http://127.0.0.1:54321/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec next start -p 3100',
      url: 'http://127.0.0.1:3100/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl,
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
        ANTHROPIC_API_KEY: 'synthetic-anthropic-key',
        AI_MODEL: 'claude-haiku-4-5',
      },
    },
  ],
})
