import { describe, expect, it, vi } from 'vitest'
import { createApiLogger, type LogRecord } from '@/lib/api/logger'

function makeSink() {
  const records: LogRecord[] = []
  return {
    sink: (record: LogRecord) => records.push(record),
    records,
  }
}

describe('createApiLogger', () => {
  it('emits records above the minimum level', () => {
    const { sink, records } = makeSink()
    const logger = createApiLogger({ level: 'info', sink })

    logger.debug({ operation: 'GET /v1/health', method: 'GET', path: '/v1/health' })
    logger.info({ operation: 'GET /v1/health', method: 'GET', path: '/v1/health', status: 200 })
    logger.warn({
      operation: 'GET /v1/health',
      method: 'GET',
      path: '/v1/health',
      status: 401,
      reason: 'unauthorized',
    })
    logger.error({
      operation: 'GET /v1/health',
      method: 'GET',
      path: '/v1/health',
      status: 500,
      reason: 'internal_server_error',
    })

    expect(records).toHaveLength(3)
    expect(records.map((r) => r.level)).toEqual(['info', 'warn', 'error'])
  })

  it('attaches ISO timestamp to every record', () => {
    const { sink, records } = makeSink()
    const logger = createApiLogger({ level: 'debug', sink })
    logger.info({ operation: 'GET /v1/health', method: 'GET', path: '/v1/health' })
    expect(records[0]?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('preserves only the allow-listed fields shape', () => {
    const { sink, records } = makeSink()
    const logger = createApiLogger({ level: 'debug', sink })

    logger.info({
      operation: 'POST /v1/memories',
      method: 'POST',
      path: '/v1/memories',
      status: 422,
      elapsed_ms: 12,
      request_id: 'req_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      user_id_hash: 'abcd1234',
      reason: 'validation_error',
    })

    const record = records[0]
    expect(record).toBeDefined()
    expect(Object.keys(record!).sort()).toEqual(
      [
        'elapsed_ms',
        'level',
        'method',
        'operation',
        'path',
        'reason',
        'request_id',
        'status',
        'ts',
        'user_id_hash',
      ].sort(),
    )
  })

  it('falls back to console when no sink is provided', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const logger = createApiLogger({ level: 'debug' })
      logger.info({ operation: 'GET /v1/health', method: 'GET', path: '/v1/health' })
      logger.error({ operation: 'GET /v1/health', method: 'GET', path: '/v1/health', status: 500 })
      expect(consoleInfo).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleInfo.mockRestore()
      consoleError.mockRestore()
    }
  })
})
