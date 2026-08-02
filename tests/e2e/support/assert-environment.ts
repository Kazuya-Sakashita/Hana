import { assertSyntheticE2eEnvironment } from './environment'

assertSyntheticE2eEnvironment(process.env)
console.info('ISSUE-140 synthetic E2E environment accepted')
