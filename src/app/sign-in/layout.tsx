import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'サインイン | Hana',
  description: 'Hana にサインイン',
}

export default function SignInLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
