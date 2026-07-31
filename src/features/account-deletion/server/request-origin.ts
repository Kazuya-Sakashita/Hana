import { publicAppOrigin } from '@/lib/auth/safe-redirect'
import { problems } from '@/server/api/problems'

export function requireSameOrigin(request: Request): void {
  if (request.headers.get('origin') !== publicAppOrigin()) {
    throw problems.forbidden()
  }
}

export function requireSameOriginJson(request: Request): void {
  requireSameOrigin(request)
  const contentType = request.headers.get('content-type')
  if (!contentType || contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw problems.forbidden()
  }
}
