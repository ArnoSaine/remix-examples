import { FluentBundle, FluentResource } from '@fluent/bundle'
import { DOMLocalization } from '@fluent/dom'

export interface FluentDomLocalizationOptions<Locale extends string> {
  defaultLocale: Locale
  supportedLocales: readonly Locale[]
  resourceIds(locale: Locale): string[]
}

export function createFluentDomLocalization<Locale extends string>(
  options: FluentDomLocalizationOptions<Locale>,
) {
  let domLocalization: DOMLocalization | undefined

  function initializeLocalization() {
    return setLocale((document.documentElement.lang as Locale) || options.defaultLocale)
  }

  async function setLocale(locale: Locale) {
    if (!options.supportedLocales.includes(locale)) throw new Error(`Unsupported locale: ${locale}`)

    domLocalization?.disconnectRoot(document.documentElement)
    document.documentElement.lang = locale
    domLocalization = new DOMLocalization(options.resourceIds(locale), generateBundles)
    domLocalization.connectRoot(document.documentElement)
    await domLocalization.translateRoots()
  }

  function getLocalization() {
    if (!domLocalization) throw new Error('Fluent DOM localization has not been initialized')
    return domLocalization
  }

  const localization = new Proxy({} as DOMLocalization, {
    get: (_, prop) => Reflect.get(getLocalization(), prop),
    has: (_, prop) => Reflect.has(getLocalization(), prop),
    ownKeys: () => Reflect.ownKeys(getLocalization()),
    getOwnPropertyDescriptor: (_, prop) => Reflect.getOwnPropertyDescriptor(getLocalization(), prop),
  }) as DOMLocalization

  async function* generateBundles(resourceIds: string[]) {
    let locale = (document.documentElement.lang as Locale) || options.defaultLocale
    for (let resourceId of resourceIds) {
      let response = await fetch(resourceId)
      if (!response.ok) throw new Error(`Unable to load Fluent resource: ${resourceId}`)

      let bundle = new FluentBundle(locale)
      bundle.addResource(new FluentResource(await response.text()))
      yield bundle
    }
  }

  return { localization, initializeLocalization, setLocale }
}
