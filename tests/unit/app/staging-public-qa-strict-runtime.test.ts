import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-110-staging-public-qa-strict-runtime.cjs', import.meta.url),
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const publicQaSource = readFileSync(
  new URL('../../../scripts/qa/issue-075-lp-public-qa.cjs', import.meta.url),
  'utf8',
)
const releaseDoc = readFileSync(
  new URL('../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-110-staging-public-qa-strict-runtime.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const {
  publicDnsResolutionStatus,
  publicIpAddressStatus,
  publicQaArguments,
  publicQaEnvironment,
  runRuntime,
  strictPublicHttpsUrlStatus,
}: {
  publicDnsResolutionStatus: (
    hostname: string,
    resolveHostname?: (
      hostname: string,
      options: { all: true; verbatim: true },
    ) => Promise<Array<{ address: string; family: number }>>,
  ) => Promise<'pass' | 'hold'>
  publicIpAddressStatus: (value: string) => 'pass' | 'hold'
  publicQaArguments: readonly string[]
  publicQaEnvironment: (
    environment: Record<string, string | undefined>,
    baseUrl: string,
  ) => Record<string, string>
  runRuntime: (options?: {
    environment?: Record<string, string | undefined>
    execute?: typeof spawnSync
    nodePath?: string
    publicQaScriptPath?: string
    resolveHostname?: (
      hostname: string,
      options: { all: true; verbatim: true },
    ) => Promise<Array<{ address: string; family: number }>>
  }) => Promise<{
    result: 'pass' | 'hold'
    checks: Array<{ id: string; status: 'pass' | 'hold' }>
  }>
  strictPublicHttpsUrlStatus: (value: string | undefined) => 'pass' | 'hold'
} = require(scriptPath)
const {
  assertNetworkState,
  installReadOnlyNetworkGuard,
}: {
  assertNetworkState: (
    target: { id: string },
    state: {
      waitlistPostCount: number
      metricsPostCount: number
      blockedHttpRequestCount: number
      blockedWebSocketCount: number
    },
  ) => void
  installReadOnlyNetworkGuard: (
    context: {
      route: (
        pattern: string,
        handler: (route: {
          request: () => {
            method: () => string
            postDataJSON: () => unknown
            url: () => string
          }
          abort: (reason: string) => Promise<void>
          continue: () => Promise<void>
          fulfill: (response: {
            status: number
            contentType?: string
            body: string
          }) => Promise<void>
        }) => Promise<void>,
      ) => Promise<void>
      routeWebSocket: (
        pattern: string,
        handler: (route: {
          close: (options: { code: number; reason: string }) => Promise<void>
        }) => Promise<void>,
      ) => Promise<void>
    },
    baseUrl: string,
  ) => Promise<{
    waitlistPostCount: number
    metricsPostCount: number
    blockedHttpRequestCount: number
    blockedWebSocketCount: number
  }>
} = require(
  fileURLToPath(new URL('../../../scripts/qa/issue-075-lp-public-qa.cjs', import.meta.url)),
)

const publicDnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('ISSUE-110 staging public QA strict runtime', () => {
  it('passes contract mode without starting browser QA', () => {
    const sentinel = 'https://private-staging-sentinel.hana-app.dev'
    const result = run(['--mode=contract'], { STAGING_BASE_URL: sentinel })
    const payload = JSON.parse(result.stdout) as {
      issue: string
      mode: string
      result: string
      checks: string[]
    }

    expect(result.status).toBe(0)
    expect(payload).toMatchObject({
      issue: 'ISSUE-110',
      mode: 'contract',
      result: 'pass',
    })
    expect(payload.checks).toContain('contract-mode-no-external-process')
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(sentinel)
  })

  it.each([
    '',
    'http://staging.hana-app.dev',
    'https:staging.hana-app.dev',
    'https://localhost:3000',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://[::1]',
    'https://staging.internal',
    'https://staging',
    'https://staging.example.test',
    'https://foo.invalid',
    'https://foo.example',
    'https://service.home.arpa',
    'https://foo..hana-app.dev',
    'https://user:password@staging.hana-app.dev',
    'https://staging.hana-app.dev/lp',
    'https://staging.hana-app.dev?token=x',
    'https://staging.hana-app.dev#fragment',
    'not-a-url',
  ])('rejects unsafe staging URL before browser execution: %s', async (baseUrl) => {
    const execute = vi.fn()
    const payload = await runRuntime({
      environment: { STAGING_BASE_URL: baseUrl },
      execute: execute as unknown as typeof spawnSync,
    })

    expect(strictPublicHttpsUrlStatus(baseUrl)).toBe('hold')
    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'staging-base-url',
      kind: 'public-https-origin',
      status: 'hold',
    })
    expect(execute).not.toHaveBeenCalled()
    if (baseUrl) expect(JSON.stringify(payload)).not.toContain(baseUrl)
  })

  it('rejects non-default ports and private DNS answers before browser execution', async () => {
    expect(strictPublicHttpsUrlStatus('https://staging.hana-app.dev:8443')).toBe('hold')
    expect(strictPublicHttpsUrlStatus('https://staging.hana-app.dev:443')).toBe('pass')
    expect(publicIpAddressStatus('127.0.0.1')).toBe('hold')
    expect(publicIpAddressStatus('10.0.0.1')).toBe('hold')
    expect(publicIpAddressStatus('169.254.169.254')).toBe('hold')
    expect(publicIpAddressStatus('::1')).toBe('hold')
    expect(publicIpAddressStatus('::127.0.0.1')).toBe('hold')
    expect(publicIpAddressStatus('fc00::1')).toBe('hold')
    expect(publicIpAddressStatus('fec0::1')).toBe('hold')
    expect(publicIpAddressStatus('64:ff9b:1::a00:1')).toBe('hold')
    expect(publicIpAddressStatus('100:0:0:1::1')).toBe('hold')
    expect(publicIpAddressStatus('3fff::1')).toBe('hold')
    expect(publicIpAddressStatus('5f00::1')).toBe('hold')
    expect(publicIpAddressStatus('2606:4700:4700::1111')).toBe('pass')
    expect(publicIpAddressStatus('93.184.216.34')).toBe('pass')

    const execute = vi.fn()
    const payload = await runRuntime({
      environment: {
        STAGING_BASE_URL: 'https://staging.hana-app.dev',
        STAGING_EGRESS_CONTROL_CONFIRMED: 'confirmed',
      },
      execute: execute as unknown as typeof spawnSync,
      resolveHostname: async () => [{ address: '10.0.0.1', family: 4 }],
    })

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'staging-dns-addresses',
      kind: 'public-addresses-only',
      status: 'hold',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('holds before DNS or browser execution without egress control attestation', async () => {
    const execute = vi.fn()
    const resolveHostname = vi.fn(publicDnsLookup)
    const payload = await runRuntime({
      environment: { STAGING_BASE_URL: 'https://staging.hana-app.dev' },
      execute: execute as unknown as typeof spawnSync,
      resolveHostname,
    })

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'staging-egress-control',
      kind: 'operator-attestation',
      status: 'hold',
    })
    expect(resolveHostname).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('holds when any DNS answer is private or resolution fails', async () => {
    expect(
      await publicDnsResolutionStatus('staging.hana-app.dev', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.10', family: 4 },
      ]),
    ).toBe('hold')
    expect(
      await publicDnsResolutionStatus('staging.hana-app.dev', async () => {
        throw new Error('private-dns-error-sentinel')
      }),
    ).toBe('hold')
  })

  it('runs only ISSUE-075 app mode with redacted child output', async () => {
    const baseUrl = 'https://private-staging-sentinel.hana-app.dev'
    const nodePath = '/private/node-sentinel'
    const publicQaScriptPath = '/private/issue-075-sentinel.cjs'
    const execute = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: 'email-and-payload-sentinel',
      stderr: 'host-sentinel',
    }))
    const payload = await runRuntime({
      environment: {
        STAGING_BASE_URL: baseUrl,
        STAGING_EGRESS_CONTROL_CONFIRMED: 'confirmed',
        PATH: '/path-sentinel',
        CODEX_RUNTIME_NODE_MODULES: '/playwright-sentinel',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-sentinel',
      },
      execute: execute as unknown as typeof spawnSync,
      nodePath,
      publicQaScriptPath,
      resolveHostname: publicDnsLookup,
    })
    const serialized = JSON.stringify(payload)

    expect(publicQaArguments).toEqual(['--mode=app'])
    expect(payload.result).toBe('pass')
    expect(execute).toHaveBeenCalledWith(nodePath, [publicQaScriptPath, '--mode=app'], {
      cwd: repoRoot,
      env: expect.objectContaining({
        PLAYWRIGHT_BASE_URL: baseUrl,
        PATH: '/path-sentinel',
        CODEX_RUNTIME_NODE_MODULES: '/playwright-sentinel',
        NO_COLOR: '1',
      }),
      stdio: 'ignore',
      timeout: 180_000,
      killSignal: 'SIGKILL',
    })
    for (const sensitiveValue of [
      baseUrl,
      'private-staging-sentinel.hana-app.dev',
      'email-and-payload-sentinel',
      'host-sentinel',
      'service-role-secret-sentinel',
    ]) {
      expect(serialized).not.toContain(sensitiveValue)
    }
  })

  it('passes only allowlisted environment values to public QA', () => {
    const childEnvironment = publicQaEnvironment(
      {
        PATH: '/path-sentinel',
        CODEX_RUNTIME_NODE_MODULES: '/playwright-sentinel',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-sentinel',
        ANTHROPIC_API_KEY: 'anthropic-secret-sentinel',
        NODE_OPTIONS: '--require=/private/injected.cjs',
      },
      'https://staging.hana-app.dev',
    )
    const serialized = JSON.stringify(childEnvironment)

    expect(childEnvironment).toMatchObject({
      PLAYWRIGHT_BASE_URL: 'https://staging.hana-app.dev',
      PATH: '/path-sentinel',
      CODEX_RUNTIME_NODE_MODULES: '/playwright-sentinel',
      NO_COLOR: '1',
    })
    expect(serialized).not.toContain('service-role-secret-sentinel')
    expect(serialized).not.toContain('anthropic-secret-sentinel')
    expect(serialized).not.toContain('injected.cjs')
  })

  it.each([
    { status: 1, signal: null },
    { status: null, signal: 'SIGKILL' },
    { status: null, signal: null, error: new Error('private-runtime-error') },
  ])('normalizes browser execution failure to a redacted hold', async (execution) => {
    const execute = vi.fn(() => execution)
    const payload = await runRuntime({
      environment: {
        STAGING_BASE_URL: 'https://staging.hana-app.dev',
        STAGING_EGRESS_CONTROL_CONFIRMED: 'confirmed',
      },
      execute: execute as unknown as typeof spawnSync,
      resolveHostname: publicDnsLookup,
    })

    expect(payload.result).toBe('hold')
    expect(payload.checks).toContainEqual({
      id: 'waitlist-post-mock',
      kind: 'read-only-browser-route',
      status: 'hold',
    })
    expect(JSON.stringify(payload)).not.toContain('private-runtime-error')
  })

  it.each([
    ['--mode=unknown-host-sentinel', 'unsupported_mode'],
    ['--mode=runtime', '--target=staging', 'invalid_arguments'],
    ['--mode=runtime', '--mode=contract', 'invalid_arguments'],
  ])('rejects invalid arguments without echoing input', (...args) => {
    const reason = args.pop()
    const result = run(args)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'fail', reason })
    expect(output).not.toContain('unknown-host-sentinel')
  })

  it('requires the read-only network guard before every public navigation', () => {
    const mockInstallIndex = publicQaSource.indexOf('await installReadOnlyNetworkGuard(context)')
    const navigationIndex = publicQaSource.indexOf(
      'await page.goto(new URL(target.path, baseUrl).toString()',
    )
    const noJsGuardIndex = publicQaSource.indexOf(
      'networkState = await installReadOnlyNetworkGuard(context)',
    )
    const noJsNavigationIndex = publicQaSource.indexOf(
      'await page.goto(new URL(noJsFallback.path, baseUrl).toString()',
    )

    expect(publicQaSource).toContain("context.route('**/*'")
    expect(publicQaSource).toContain("serviceWorkers: 'block'")
    expect(mockInstallIndex).toBeGreaterThan(-1)
    expect(navigationIndex).toBeGreaterThan(mockInstallIndex)
    expect(noJsGuardIndex).toBeGreaterThan(-1)
    expect(noJsNavigationIndex).toBeGreaterThan(noJsGuardIndex)
    expect(publicQaSource).toContain(
      'await context.close()\n        }\n        assertNetworkState(target, networkState)',
    )
    expect(publicQaSource).toContain(
      "await context.close()\n  }\n  assertNetworkState({ id: 'no-js' }, networkState)",
    )
  })

  it('fails closed for external or mutating requests and counts the waitlist mock', async () => {
    let handler:
      | ((route: {
          request: () => {
            method: () => string
            postDataJSON: () => unknown
            url: () => string
          }
          abort: (reason: string) => Promise<void>
          continue: () => Promise<void>
          fulfill: (response: {
            status: number
            contentType?: string
            body: string
          }) => Promise<void>
        }) => Promise<void>)
      | undefined
    let webSocketHandler:
      | ((route: {
          close: (options: { code: number; reason: string }) => Promise<void>
        }) => Promise<void>)
      | undefined
    const context = {
      route: vi.fn(async (_pattern: string, routeHandler: NonNullable<typeof handler>) => {
        handler = routeHandler
      }),
      routeWebSocket: vi.fn(
        async (_pattern: string, routeHandler: NonNullable<typeof webSocketHandler>) => {
          webSocketHandler = routeHandler
        },
      ),
    }
    const state = await installReadOnlyNetworkGuard(context, 'https://staging.hana-app.dev')

    function routeFor(url: string, method: string, payload: unknown = null) {
      return {
        request: () => ({
          method: () => method,
          postDataJSON: () => payload,
          url: () => url,
        }),
        abort: vi.fn(async () => undefined),
        continue: vi.fn(async () => undefined),
        fulfill: vi.fn(async () => undefined),
      }
    }

    const sameOriginGet = routeFor('https://staging.hana-app.dev/lp', 'GET')
    const externalGet = routeFor('https://tracker.invalid/pixel', 'GET')
    const unexpectedMutation = routeFor('https://staging.hana-app.dev/v1/memories', 'POST', {})
    const metricsPost = routeFor('https://staging.hana-app.dev/v1/metrics/vitals', 'POST', {})
    const waitlistPost = routeFor('https://staging.hana-app.dev/v1/waitlist', 'POST', {
      email: 'redacted-fixture',
      consent: true,
      source: 'current-lp',
      privacy_policy_version: 'prelaunch-2026-07-25',
    })

    await handler?.(sameOriginGet)
    await handler?.(externalGet)
    await handler?.(unexpectedMutation)
    await handler?.(metricsPost)
    await handler?.(waitlistPost)
    const webSocketRoute = {
      close: vi.fn(async () => undefined),
    }
    await webSocketHandler?.(webSocketRoute)

    expect(sameOriginGet.continue).toHaveBeenCalledOnce()
    expect(externalGet.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(unexpectedMutation.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(metricsPost.fulfill).toHaveBeenCalledWith({ status: 204, body: '' })
    expect(waitlistPost.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 202 }))
    expect(webSocketRoute.close).toHaveBeenCalledWith({
      code: 1008,
      reason: 'qa_read_only',
    })
    expect(state.waitlistPostCount).toBe(1)
    expect(state.metricsPostCount).toBe(1)
    expect(state.blockedHttpRequestCount).toBe(2)
    expect(state.blockedWebSocketCount).toBe(1)
    expect(() => assertNetworkState({ id: 'lp' }, state)).toThrow('lp: network_policy_violation')
  })

  it('records the strict runtime contract and merged state', () => {
    expect(packageSource).toContain('qa:issue110:staging-public')
    expect(packageSource).toContain('pnpm qa:issue110:staging-public -- --mode=contract')
    expect(releaseDoc).toContain('host、email、payload')
    expect(issueSource).toContain('github_issue: 240')
    expect(issueSource).toContain('status: done')
    expect(issueIndexSource).toContain('| `ISSUE-110` | `#240` | `done` |')
  })
})
