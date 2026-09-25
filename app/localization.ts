import { createRemixLocalization, negotiateLocale } from '@example/fluent-remix/server'
import { readFile } from 'node:fs/promises'

import {
  DEFAULT_LOCALE,
  RESOURCE_IDS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './actions/public/locales.ts'

import { localeCookie } from './locale-cookie.ts'

let { localization, middleware: localizationMiddleware } = createRemixLocalization<SupportedLocale>(
  {
    async getLocale(request) {
      return negotiateLocale(request, {
        defaultLocale: DEFAULT_LOCALE,
        supportedLocales: SUPPORTED_LOCALES,
        savedLocale: await localeCookie.parse(request.headers.get('Cookie')),
      })
    },
    resourceIds: RESOURCE_IDS,
    async *generateResources(resourceIds: string[]) {
      for (let resourceId of resourceIds) {
        yield readFile(new URL(`../public/${resourceId}`, import.meta.url), 'utf8')
      }
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
