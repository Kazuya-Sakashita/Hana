function checkedDatabaseUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name.toLowerCase()}_required`)
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${name.toLowerCase()}_loopback_required`)
  }
  if (url.pathname !== '/hana_ci') throw new Error(`${name.toLowerCase()}_hana_ci_required`)
  return url
}

export function assertIssue151DatabaseQaEnvironment(environment: {
  [key: string]: string | undefined
}): void {
  if (environment.ISSUE_151_DATABASE_QA !== '1') {
    throw new Error('issue_151_database_qa_opt_in_required')
  }
  const databaseUrl = checkedDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL')
  const directUrl = checkedDatabaseUrl(environment.DIRECT_URL, 'DIRECT_URL')
  const childDatabaseUrl = checkedDatabaseUrl(environment.CHILD_DATABASE_URL, 'CHILD_DATABASE_URL')
  if (databaseUrl.username !== 'postgres') throw new Error('database_url_admin_role_required')
  if (directUrl.username !== 'hana_migrator') throw new Error('direct_url_migrator_role_required')
  if (childDatabaseUrl.username !== 'hana_child_runtime') {
    throw new Error('child_database_url_runtime_role_required')
  }
  const targets = [databaseUrl, directUrl, childDatabaseUrl].map(
    (url) => `${url.hostname}:${url.port || '5432'}${url.pathname}`,
  )
  if (new Set(targets).size !== 1) {
    throw new Error('database_targets_must_match')
  }
}
