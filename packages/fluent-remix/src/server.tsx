import { FluentBundle, FluentResource } from '@fluent/bundle'
import { DOMLocalization } from '@fluent/dom'
import { acceptedLanguages, negotiateLanguages } from '@fluent/langneg'
import { JSDOM } from 'jsdom'
import { Renderer, type RenderFunction } from 'remix/middleware/render'
import { createContextKey, type ContextEntry, type Middleware } from 'remix/router'
import type { Handle } from 'remix/ui'
import type { RemixNode } from 'remix/ui/jsx-runtime'

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
  loadResource(locale: Locale): string
  getLocale(request: Request): Promise<Locale>
}

export function createRemixLocalization<Locale extends string>(
  options: RemixLocalizationOptions<Locale>,
) {
  function createBundle(locale: Locale) {
    let bundle = new FluentBundle(locale)
    bundle.addResource(new FluentResource(options.loadResource(locale)))
    return bundle
  }

  function getTranslator(locale: Locale): Translate {
    let bundle = createBundle(locale)

    return (id, args, errors) => {
      let message = bundle.getMessage(id)
      if (!message?.value) throw new Error(`Missing Fluent message: ${id}`)
      return bundle.formatPattern(message.value, args, errors)
    }
  }

  async function localizeHtml(html: string, locale: Locale) {
    let dom = new JSDOM(html, { url: 'http://localhost' })
    let localization = new DOMLocalization([], function* () {
      yield createBundle(locale)
    })

    localization.connectRoot(dom.window.document.documentElement)
    await localization.translateRoots()
    return dom.serialize()
  }

  async function localizeHtmlResponse(response: Response, locale: Locale) {
    let contentType = response.headers.get('Content-Type') ?? ''
    if (!contentType.includes('text/html')) return response

    let headers = new Headers(response.headers)
    headers.set('Content-Type', 'text/html; charset=utf-8')

    return new Response(await localizeHtml(await response.text(), locale), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
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
    let translate = getTranslator(locale)
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
    let headers = new Headers(response.headers)
    headers.append('Vary', 'Accept-Language')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return { Locale, Translator, LocalizationProvider, localization, middleware }
}
