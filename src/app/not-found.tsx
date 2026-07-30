import { RecoveryScreen } from '@/components/product/recovery-screen'

export default function NotFound() {
  return (
    <RecoveryScreen
      eyebrow="ページが見つかりません"
      title="このページは、ここにはないようです"
      description="場所が変わったか、まだ作られていないページかもしれません。ホームやアルバムから、続きをお探しいただけます。"
    />
  )
}
