export const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000
export const UNCONFIRMED_UPLOAD_RETENTION_MS = 48 * 60 * 60 * 1000
export const CLEANUP_CLAIM_LEASE_MS = 10 * 60 * 1000
export const CLEANUP_MAX_ATTEMPTS = 10

export function uploadReservationTimes(now = new Date()) {
  return {
    issuedAt: now,
    signedUrlExpiresAt: new Date(now.getTime() + SIGNED_UPLOAD_TTL_MS),
    cleanupAfter: new Date(now.getTime() + UNCONFIRMED_UPLOAD_RETENTION_MS),
  }
}
