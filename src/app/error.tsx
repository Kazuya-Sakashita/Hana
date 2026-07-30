'use client'

import { RecoveryScreen } from '@/components/product/recovery-screen'

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RecoveryScreen
      eyebrow="うまく開けませんでした"
      title="大切な記録は、そのままです"
      description="一時的にページを開けませんでした。少し待ってから、もう一度お試しください。"
      retry={reset}
    />
  )
}
