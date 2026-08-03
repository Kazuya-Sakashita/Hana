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
}): { databaseUrl: string; directUrl: string } {
  if (environment.ISSUE_151_DATABASE_QA !== '1') {
    throw new Error('issue_151_database_qa_opt_in_required')
  }
  const databaseUrl = checkedDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL')
  const directUrl = checkedDatabaseUrl(environment.DIRECT_URL, 'DIRECT_URL')
  if (databaseUrl.toString() !== directUrl.toString()) {
    throw new Error('database_urls_must_match')
  }
  return { databaseUrl: databaseUrl.toString(), directUrl: directUrl.toString() }
}
