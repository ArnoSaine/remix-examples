# @example/fluent-remix

[Fluent](https://projectfluent.org/) localization helpers for [Remix 3](https://remix.run/). The package provides server-side request locale negotiation and HTML localization, browser-side DOM localization, and a small helper for typed message descriptors.

## Install

```sh
npm install @example/fluent-remix remix
```

The package expects Fluent resources in `.ftl` format. The `@fluent/bundle`, `@fluent/dom`, `@fluent/langneg`, and `jsdom` packages are installed as runtime dependencies. `remix` is a peer dependency.

## Server setup

Create a localization instance with a locale policy and a resource loader. `getLocale` runs for each request, so it can use a cookie, the `Accept-Language` header, or application-specific logic.

```ts
// app/localization.ts

import { createRemixLocalization, negotiateLocale } from '@example/fluent-remix/server'
import { readFile } from 'node:fs/promises'

const supportedLocales = ['en-US', 'es'] as const
type Locale = (typeof supportedLocales)[number]

export const { localization, middleware } = createRemixLocalization<Locale>({
  loadResource(locale) {
    return readFile(new URL(`./locales/${locale}.ftl`, import.meta.url), 'utf8')
  },
  getLocale(request) {
    return negotiateLocale(request, {
      defaultLocale: 'en-US',
      supportedLocales,
    })
  },
})
```

`negotiateLocale` first honors a supported saved locale, then negotiates the request's `Accept-Language` header, and finally falls back to the configured default locale.

Add `middleware` after Remix's render middleware:

```ts
import { render } from 'remix/middleware/render'
import { staticFiles } from 'remix/middleware/static'
import { createRouter } from 'remix/router'

import { assets } from './assets.ts'
import { middleware as localizationMiddleware } from './localization.ts'

const renderMiddleware = render({ assets })

export const router = createRouter({
  middleware: [staticFiles('./public', { index: false }), renderMiddleware, localizationMiddleware],
})
```

For ordinary rendered text and translatable attributes, prefer `data-l10n-id`:

```tsx
function Masthead() {
  return () => (
    <section aria-label="Welcome" data-l10n-id="masthead">
      <p data-l10n-id="welcome">Welcome to</p>
      ...
    </section>
  )
}
```

Use `localization(handle)` to access the current locale or `translate()` inside components:

```tsx
import type { Handle } from 'remix/ui'

import { localization } from '../localization.ts'

export function Document(handle: Handle<DocumentProps>) {
  let { locale } = localization(handle)
  return () => {
    return <html lang={locale}>...</html>
  }
}
```

Use `context.locale` and `context.translate()` when the current locale or a translated string is needed outside the DOM, such as in a JSON response, email, notification payload, or HTTP header:

```ts
import { createController } from 'remix/router'

import { routes } from '../routes.ts'

export default createController(routes, {
  actions: {
    home(context) {
      return new Response(context.translate('welcome'))
    },
  },
})
```

## Browser setup

Create a browser localization instance:

```ts
// app/actions/public/localization.ts

import { createFluentDomLocalization } from '@example/fluent-remix/client'
import { run } from 'remix/ui'

const { localization, initializeLocalization, setLocale } = createFluentDomLocalization({
  defaultLocale: 'en-US',
  supportedLocales: ['en-US', 'es'] as const,
  resourceIds: (locale) => [`/locales/${locale}.ftl`],
})

const app = run({
  // Remix browser runtime options...
})

// Initialize after run() so the server-rendered document is ready first.
await initializeLocalization()

// Change the locale later when the user selects another language.
await setLocale('es')
```

Call `initializeLocalization` after the Remix browser runtime has been created with `run()`. This is the package's client-side hydration initialization step: it attaches Fluent to the server-rendered document and translates the existing DOM.

`initializeLocalization` uses the document's `lang` attribute when present; otherwise it uses `defaultLocale`. `setLocale` updates the `lang` attribute, reloads the Fluent resource, and translates the connected document. The `localization` property exposes the underlying `DOMLocalization` instance after initialization:

```tsx
import { localization } from './localization.ts'

// ...

async function clickHandler() {
  await navigator.clipboard.writeText(await localization.formatValue('prompt-shopify'))
}
```

When using Remix's asset pipeline, allow the package and its browser dependencies in the asset configuration so the client entry can be served:

```ts
allowPackages: ['remix', '@example/fluent-remix', '@fluent/bundle', '@fluent/dom']
```

## Message descriptors

Use `defineMessage` for message descriptors passed between components:

```tsx
import { defineMessage } from '@example/fluent-remix'

function GetStartedCard() {
  return () => (
    <CardLink
      href="https://api.remix.run"
      icon={<AtomIcon />}
      label={defineMessage({ id: 'remix-api', defaultMessage: 'Remix API' })}
    />
  )
}
```

The helper preserves the descriptor's `id` and `defaultMessage` and provides the `MessageDescriptor` type. It marks a message descriptor for discovery by future tooling to extract localization messages.

## Fluent resources

[Syntax Guide](https://projectfluent.org/fluent/guide/)

```ftl
welcome = Welcome, { $name }!
```

## License

MIT
