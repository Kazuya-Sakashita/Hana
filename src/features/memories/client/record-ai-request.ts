export const AI_GENERATION_TIMEOUT_MS = 30_000

export type TimedAiRequestResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'timeout' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'stale' }

export async function runTimedAiRequest<T>({
  controller,
  isCurrent,
  request,
  timeoutMs = AI_GENERATION_TIMEOUT_MS,
}: {
  controller: AbortController
  isCurrent: () => boolean
  request: (signal: AbortSignal) => Promise<T>
  timeoutMs?: number
}): Promise<TimedAiRequestResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const requestOutcome: Promise<TimedAiRequestResult<T>> = Promise.resolve()
    .then(() => request(controller.signal))
    .then(
      (value): TimedAiRequestResult<T> => ({ kind: 'success', value }),
      (error: unknown): TimedAiRequestResult<T> => ({ kind: 'failed', error }),
    )
  const timeoutOutcome = new Promise<TimedAiRequestResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve({ kind: 'timeout' })
    }, timeoutMs)
  })

  const outcome = await Promise.race([requestOutcome, timeoutOutcome])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  if (!isCurrent()) return { kind: 'stale' }
  if (outcome.kind === 'failed' && controller.signal.aborted) return { kind: 'stale' }
  return outcome
}
