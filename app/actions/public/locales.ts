export const DEFAULT_LOCALE = 'en-US'
export const SUPPORTED_LOCALES = [DEFAULT_LOCALE, 'es'] as const
export const LOCALE_COOKIE_NAME = 'locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
export const RESOURCE_IDS = (locale: SupportedLocale) => [`/locales/${locale}.ftl`]

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
