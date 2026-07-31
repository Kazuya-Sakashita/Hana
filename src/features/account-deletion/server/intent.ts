import { createHash, randomBytes } from 'node:crypto'

export const ACCOUNT_DELETION_INTENT_COOKIE = 'hana_account_deletion_intent'
export const ACCOUNT_DELETION_RECEIPT_COOKIE = 'hana_account_deletion_receipt'
export const ACCOUNT_DELETION_INTENT_TTL_MS = 5 * 60 * 1000
export const ACCOUNT_DELETION_CONFIRMATION = '退会する'

export function createAccountDeletionIntentSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function hashAccountDeletionIntentSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function accountDeletionIntentCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCOUNT_DELETION_INTENT_TTL_MS / 1000,
  }
}

export function accountDeletionReceiptCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  }
}
