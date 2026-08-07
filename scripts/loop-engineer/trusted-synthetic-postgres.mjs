const expectedProtocol = 'postgresql:'
const expectedHosts = new Set(['localhost', '127.0.0.1'])

export function checkedSyntheticPostgresUrl(
  value,
  expectedUser,
  expectedPassword,
  expectedPort = '5432',
) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('synthetic_database_url_required')
  }
  if (!/^\d{1,5}$/.test(expectedPort)) throw new Error('synthetic_database_port_required')

  const url = new URL(value)
  if (
    url.protocol !== expectedProtocol ||
    !expectedHosts.has(url.hostname) ||
    url.port !== expectedPort ||
    url.pathname !== '/hana_ci' ||
    decodeURIComponent(url.username) !== expectedUser ||
    decodeURIComponent(url.password) !== expectedPassword ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('synthetic_database_target_required')
  }

  return url.toString()
}
