const { isIP } = require('node:net')

function presenceStatus(value) {
  return typeof value === 'string' && value.trim().length > 0 ? 'pass' : 'hold'
}

function publicDnsHostnameStatus(value) {
  const hostname = value
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  const labels = hostname.split('.')
  const hasValidLabels =
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  const reservedSuffixes = ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion']
  const isReserved =
    reservedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)) ||
    hostname === 'home.arpa' ||
    hostname.endsWith('.home.arpa')

  return hasValidLabels && !isReserved && isIP(hostname) === 0 ? 'pass' : 'hold'
}

function publicHttpsUrlStatus(value) {
  if (presenceStatus(value) === 'hold') return 'hold'

  try {
    const candidate = value.trim()
    const scheme = candidate.match(/^https:\/\//i)?.[0]
    if (!scheme) return 'hold'

    const url = new URL(candidate)
    const authorityStart = scheme.length
    const suffixStart = [
      candidate.indexOf('/', authorityStart),
      candidate.indexOf('\\', authorityStart),
      candidate.indexOf('?', authorityStart),
      candidate.indexOf('#', authorityStart),
    ]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0]
    const suffix = suffixStart === undefined ? '' : candidate.slice(suffixStart)
    const authority = candidate.slice(authorityStart, suffixStart ?? candidate.length)
    const isOriginOnly = suffix === '' || suffix === '/'
    const hasCredentials = authority.includes('@') || Boolean(url.username || url.password)

    return url.protocol === 'https:' &&
      publicDnsHostnameStatus(url.hostname) === 'pass' &&
      isOriginOnly &&
      !hasCredentials &&
      url.port === ''
      ? 'pass'
      : 'hold'
  } catch {
    return 'hold'
  }
}

module.exports = {
  presenceStatus,
  publicDnsHostnameStatus,
  publicHttpsUrlStatus,
}
