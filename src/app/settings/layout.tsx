import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '設定 | Hana',
  description: 'Hana の設定',
}

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
