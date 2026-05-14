export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type LogFields = {
  operation: string
  method: HttpMethod
  path: string
  status?: number
  elapsed_ms?: number
  request_id?: string
  user_id_hash?: string
  reason?: string
}

export type LogRecord = LogFields & {
  level: LogLevel
  ts: string
}

export type LogSink = (record: LogRecord) => void

export type ApiLogger = {
  debug: (fields: LogFields) => void
  info: (fields: LogFields) => void
  warn: (fields: LogFields) => void
  error: (fields: LogFields) => void
}

export type CreateApiLoggerOptions = {
  level?: LogLevel
  sink?: LogSink
}

const defaultSink: LogSink = (record) => {
  const line = JSON.stringify(record)
  if (record.level === 'error' || record.level === 'warn') {
    console.error(line)
  } else {
    console.info(line)
  }
}

export function createApiLogger(options: CreateApiLoggerOptions = {}): ApiLogger {
  const minLevel = LEVEL_ORDER[options.level ?? 'info']
  const sink = options.sink ?? defaultSink

  function emit(level: LogLevel, fields: LogFields): void {
    if (LEVEL_ORDER[level] < minLevel) return
    sink({ ...fields, level, ts: new Date().toISOString() })
  }

  return {
    debug: (fields) => emit('debug', fields),
    info: (fields) => emit('info', fields),
    warn: (fields) => emit('warn', fields),
    error: (fields) => emit('error', fields),
  }
}
