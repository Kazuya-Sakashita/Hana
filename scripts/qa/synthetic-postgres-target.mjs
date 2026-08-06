const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

export function checkedSyntheticPostgresConfig(value, name) {
  const reasonPrefix = name.toLowerCase()
  if (!value) throw new Error(`${reasonPrefix}_required`)

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${reasonPrefix}_invalid`)
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${reasonPrefix}_protocol_required`)
  }
  if (url.search || url.hash) {
    throw new Error(`${reasonPrefix}_connection_options_not_allowed`)
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${reasonPrefix}_loopback_required`)
  }
  if (url.pathname !== '/hana_ci') throw new Error(`${reasonPrefix}_hana_ci_required`)

  return {
    host: url.hostname,
    port: Number(url.port || '5432'),
    database: 'hana_ci',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  }
}
