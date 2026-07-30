'use client'

const HOME_PROFILE_REFRESH_KEY = 'hana:home-profile-refresh'

export function markHomeProfileRefresh() {
  sessionStorage.setItem(HOME_PROFILE_REFRESH_KEY, '1')
}

export function consumeHomeProfileRefresh(): boolean {
  const marked = sessionStorage.getItem(HOME_PROFILE_REFRESH_KEY) === '1'
  if (marked) sessionStorage.removeItem(HOME_PROFILE_REFRESH_KEY)
  return marked
}
