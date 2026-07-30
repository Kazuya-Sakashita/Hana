'use client'

export async function signOutAndClear({ clearLocalState }: { clearLocalState: () => void }) {
  const response = await fetch('/sign-out', { method: 'POST' })
  if (!response.ok) throw new Error('sign_out_failed')

  try {
    clearLocalState()
  } catch {
    // The server session is already invalid. Local cleanup must not misreport sign-out as failed.
  }
}

export function clearLocalSessionState(clearers: Array<() => void>) {
  for (const clear of clearers) {
    try {
      clear()
    } catch {
      // Continue so one unavailable storage surface cannot leave the remaining caches intact.
    }
  }
}
