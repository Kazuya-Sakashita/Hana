import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'はじめの設定 | Hana',
  description: 'Hana を始めるための設定',
}

export default function OnboardingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
