import { createRemixLocalization, negotiateLocale } from '@example/fluent-remix/server'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './actions/public/locales.ts'

import { localeCookie } from './locale-cookie.ts'

let { localization, middleware: localizationMiddleware } = createRemixLocalization<SupportedLocale>(
  {
    loadResource(locale) {
      return readFileSync(new URL(`../public/locales/${locale}.ftl`, import.meta.url), 'utf8')
    },
    async getLocale(request) {
      return negotiateLocale(request, {
        defaultLocale: DEFAULT_LOCALE,
        supportedLocales: SUPPORTED_LOCALES,
        savedLocale: await localeCookie.parse(request.headers.get('Cookie')),
      })
    },
  },
)

export { localization }

export let middleware: typeof localizationMiddleware = async (
  context: Parameters<typeof localizationMiddleware>[0],
  next: Parameters<typeof localizationMiddleware>[1],
) => {
  let response = await localizationMiddleware(context, next)
  response.headers.append('Vary', 'Cookie')
  return response
}
