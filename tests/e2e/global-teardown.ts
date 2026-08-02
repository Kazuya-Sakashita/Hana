import { cleanupSyntheticAccount } from './support/database'

export default async function globalTeardown() {
  await cleanupSyntheticAccount()
}
