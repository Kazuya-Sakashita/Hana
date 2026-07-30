import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '記録をつくる | Hana',
  description: 'Hana で記録をつくる',
}

export default function RecordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
