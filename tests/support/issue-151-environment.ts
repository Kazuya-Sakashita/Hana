import { checkedSyntheticPostgresConfig } from '../../scripts/qa/synthetic-postgres-target.mjs'

export function assertIssue151DatabaseQaEnvironment(environment: {
  [key: string]: string | undefined
}): void {
  if (environment.ISSUE_151_DATABASE_QA !== '1') {
    throw new Error('issue_151_database_qa_opt_in_required')
  }
  const database = checkedSyntheticPostgresConfig(environment.DATABASE_URL, 'DATABASE_URL')
  const direct = checkedSyntheticPostgresConfig(environment.DIRECT_URL, 'DIRECT_URL')
  const child = checkedSyntheticPostgresConfig(environment.CHILD_DATABASE_URL, 'CHILD_DATABASE_URL')
  if (database.user !== 'hana_admin') throw new Error('database_url_admin_role_required')
  if (direct.user !== 'postgres') throw new Error('direct_url_schema_owner_role_required')
  if (child.user !== 'hana_child_runtime') {
    throw new Error('child_database_url_runtime_role_required')
  }
  const targets = [database, direct, child].map(
    (config) => `${config.host}:${config.port}/${config.database}`,
  )
  if (new Set(targets).size !== 1) {
    throw new Error('database_targets_must_match')
  }
}
