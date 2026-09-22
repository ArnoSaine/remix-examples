import { createCookie } from 'remix/cookie'

import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from './actions/public/locales.ts'

export const localeCookie = createCookie(LOCALE_COOKIE_NAME, {
  path: '/',
  sameSite: 'Lax',
  maxAge: LOCALE_COOKIE_MAX_AGE,
  encode: (value) => value,
  decode: (value) => value,
})
