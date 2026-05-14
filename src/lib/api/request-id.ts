const REQUEST_ID_PREFIX = 'req_'

export const REQUEST_ID_PATTERN =
  /^req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function generateRequestId(): string {
  return `${REQUEST_ID_PREFIX}${crypto.randomUUID()}`
}

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}
