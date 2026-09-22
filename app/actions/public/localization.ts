import { createFluentDomLocalization } from '@example/fluent-remix/client'

import { DEFAULT_LOCALE, RESOURCE_IDS, SUPPORTED_LOCALES } from './locales.ts'

export let { localization, initializeLocalization, setLocale } = createFluentDomLocalization({
  defaultLocale: DEFAULT_LOCALE,
  supportedLocales: SUPPORTED_LOCALES,
  resourceIds: RESOURCE_IDS,
})
