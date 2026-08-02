function checkedDatabaseUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name.toLowerCase()}_required`)
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${name.toLowerCase()}_loopback_required`)
  }
  if (url.pathname !== '/hana_ci') throw new Error(`${name.toLowerCase()}_hana_ci_required`)
  return url
}

function checkedStorageUrl(value: string | undefined): URL {
  if (!value) throw new Error('supabase_url_required')
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('supabase_url_loopback_required')
  }
  return url
}

export function assertIssue141StorageQaEnvironment(environment: {
  [key: string]: string | undefined
}): { databaseUrl: string; directUrl: string; storageUrl: string } {
  if (environment.ISSUE_141_STORAGE_QA !== '1') {
    throw new Error('issue_141_storage_qa_opt_in_required')
  }
  const databaseUrl = checkedDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL')
  const directUrl = checkedDatabaseUrl(environment.DIRECT_URL, 'DIRECT_URL')
  if (databaseUrl.toString() !== directUrl.toString()) {
    throw new Error('database_urls_must_match')
  }
  const storageUrl = checkedStorageUrl(environment.NEXT_PUBLIC_SUPABASE_URL)
  return {
    databaseUrl: databaseUrl.toString(),
    directUrl: directUrl.toString(),
    storageUrl: storageUrl.toString(),
  }
}
