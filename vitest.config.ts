import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js の server-only / client-only は node 上のテストで動かないため空モジュールに置き換え。
      'server-only': path.resolve(__dirname, './tests/setup/server-only-shim.ts'),
      'client-only': path.resolve(__dirname, './tests/setup/server-only-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/setup/**', 'node_modules/**'],
    globals: false,
  },
})
