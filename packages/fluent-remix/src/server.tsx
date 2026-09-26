import { FluentBundle, FluentResource } from '@fluent/bundle'
import { DOMLocalization } from '@fluent/dom'
import { acceptedLanguages, negotiateLanguages } from '@fluent/langneg'
import { JSDOM } from 'jsdom'
import { Renderer, type RenderFunction } from 'remix/middleware/render'
import { createContextKey, type ContextEntry, type Middleware } from 'remix/router'
import type { Handle } from 'remix/ui'
import type { RemixNode } from 'remix/ui/jsx-runtime'
import { nullLocalizedChildren } from './nullLocalizedChildren.ts'

export type Translate = (
  id: string,
  args?: Parameters<FluentBundle['formatPattern']>[1],
  errors?: Parameters<FluentBundle['formatPattern']>[2],
) => string

export interface LocaleNegotiationOptions<Locale extends string> {
  defaultLocale: Locale
  supportedLocales: readonly Locale[]
  savedLocale?: string | null | undefined
}

export async function negotiateLocale<Locale extends string>(
  request: Request,
  { defaultLocale, supportedLocales, savedLocale }: LocaleNegotiationOptions<Locale>,
): Promise<Locale> {
  if (savedLocale && supportedLocales.includes(savedLocale as Locale)) return savedLocale as Locale

  return negotiateLanguages(
    acceptedLanguages(request.headers.get('Accept-Language') ?? ''),
    [...supportedLocales],
    { defaultLocale },
  )[0] as Locale
}

export interface RemixLocalizationOptions<Locale extends string> {
  getLocale(request: Request): Promise<Locale>
  resourceIds(locale: Locale): string[]
  generateResources(resourceIds: string[]): AsyncIterable<string>
}

export function createRemixLocalization<Locale extends string>(
  options: RemixLocalizationOptions<Locale>,
) {
  function generateBundles(locale: string) {
    return async function* generateBundles(resourceIds: string[]) {
      for await (let source of options.generateResources(resourceIds)) {
        let bundle = new FluentBundle(locale)
        bundle.addResource(new FluentResource(source))
        yield bundle
      }
    }
  }

  async function getTranslator(locale: Locale): Promise<Translate> {
    let bundles: FluentBundle[] = []
    for await (let bundle of generateBundles(locale)(options.resourceIds(locale)))
      bundles.push(bundle)

    return (id, args, errors) => {
      let bundle = bundles.find((candidate) => candidate.hasMessage(id))
      if (!bundle) throw new Error(`Missing Fluent message: ${id}`)
      let message = bundle.getMessage(id)
      if (!message?.value) throw new Error(`Missing Fluent message: ${id}`)
      return bundle.formatPattern(message.value, args, errors)
    }
  }

  async function localizeHtml(html: string, locale: Locale) {
    let dom = new JSDOM(html, { url: 'http://localhost' })
    let localization = new DOMLocalization(options.resourceIds(locale), generateBundles(locale))

    localization.connectRoot(dom.window.document.documentElement)
    await localization.translateRoots()
    return dom.serialize()
  }

  async function localizeHtmlResponse(response: Response, locale: Locale) {
    let contentType = response.headers.get('Content-Type') ?? ''
    if (!contentType.includes('text/html')) return response

    response.headers.append('Vary', 'Accept-Language')

    return new Response(await localizeHtml(await response.text(), locale), response)
  }

  let Locale = createContextKey<Locale>()
  let Translator = createContextKey<Translate>()

  type LocalizationContext = readonly [
    ContextEntry<typeof Locale, Locale> & { property: 'locale' },
    ContextEntry<typeof Translator, Translate> & { property: 'translate' },
  ]

  interface LocalizationProviderProps {
    children?: RemixNode
    locale: Locale
    translate: Translate
  }

  function LocalizationProvider(
    handle: Handle<LocalizationProviderProps, Omit<LocalizationProviderProps, 'children'>>,
  ) {
    const { children, ...context } = handle.props
    handle.context.set(context)
    return () => children
  }

  function localization(handle: Handle<unknown>) {
    return handle.context.get(LocalizationProvider)
  }

  let middleware: Middleware<LocalizationContext> = async (context, next) => {
    let locale = await options.getLocale(context.request)
    let translate = await getTranslator(locale)
    context.set(Locale, locale, { property: 'locale' })
    context.set(Translator, translate, { property: 'translate' })

    let render = context.get(Renderer) as RenderFunction
    if (!render) {
      throw new Error('Localization middleware requires the renderer to be present in the context')
    }
    context.set(Renderer, (node, init) =>
      render(
        <LocalizationProvider locale={locale} translate={translate}>
          {node}
        </LocalizationProvider>,
        init,
      ),
    )

    let response = await localizeHtmlResponse(await next(), locale)
    response = await nullLocalizedChildren(response)

    return response
  }

  return { Locale, Translator, LocalizationProvider, localization, middleware }
}
