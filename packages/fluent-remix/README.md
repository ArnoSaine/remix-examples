# @example/fluent-remix

[Fluent](https://projectfluent.org/) localization helpers for [Remix 3](https://remix.run/). The package provides server-side request locale negotiation and HTML localization, browser-side DOM localization, and a small helper for typed message descriptors.

## Install

```sh
npm install @example/fluent-remix remix
```

The package expects Fluent resources in `.ftl` format. The `@fluent/bundle`, `@fluent/dom`, `@fluent/langneg`, and `jsdom` packages are installed as runtime dependencies. `remix` is a peer dependency.

## Server setup

Create a localization instance with a locale policy, locale-specific resource IDs, and a resource generator. `getLocale` runs for each request, so it can use a cookie, the `Accept-Language` header, or application-specific logic.

```ts
// app/localization.ts

import { createRemixLocalization, negotiateLocale } from '@example/fluent-remix/server'
import { readFile } from 'node:fs/promises'

const supportedLocales = ['en-US', 'es'] as const
type Locale = (typeof supportedLocales)[number]

export const { localization, middleware } = createRemixLocalization<Locale>({
  getLocale(request) {
    return negotiateLocale(request, {
      defaultLocale: 'en-US',
      supportedLocales,
    })
  },
  resourceIds: (locale) => [`/locales/${locale}.ftl`],
  async *generateResources(resourceIds) {
    for (const resourceId of resourceIds) {
      yield readFile(new URL(`.${resourceId}`, import.meta.url), 'utf8')
    }
  },
})
```

`negotiateLocale` first honors a supported saved locale, then negotiates the request's `Accept-Language` header, and finally falls back to the configured default locale.

`resourceIds` returns the Fluent resources for the negotiated locale. `generateResources` loads their FTL source in the same order; each yielded source becomes a separate Fluent bundle, and earlier resources take precedence when more than one defines the same message.

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

### Generated IDs

For text or attributes whose ID can be derived from their content, use `data-l10n` or `data-l10n-description` instead of an explicit `data-l10n-id`:

```tsx
<p data-l10n>Welcome to Remix</p>
<img data-l10n alt="Remix logo" src="/logo.svg" />
<button data-l10n-description="Submit the signup form">Sign up</button>
```

On the server, the middleware assigns a `data-l10n-id` and removes `data-l10n` and `data-l10n-description` from the HTML before Fluent translates it. An element with `data-l10n-description` and no explicit ID also gets an ID without needing `data-l10n`. The description disambiguates otherwise identical messages; it contributes to the ID but is not displayed. Do not combine `data-l10n` with an explicit `data-l10n-id`: the server warns and leaves the explicit ID unchanged.

The ID is the first six URL-safe Base64 characters of a SHA-512 hash of sorted message fields, prefixed with `m` if the hash starts with a character invalid at the beginning of a Fluent ID: the element's text content as `defaultMessage` (when nonempty), its localizable attributes (such as `title`, `aria-label`, `alt` on images, or `placeholder` on inputs), and any `data-l10n-description`. Non-localizable attributes such as `class` and `src` do not contribute. Changing the text, description, or a localizable attribute changes the generated ID; use an explicit `data-l10n-id` when you need an ID that remains stable as the copy changes. Provide a matching message under the generated ID in your Fluent resources.

For browser-hydrated elements, the JavaScript response transform computes the same ID from **literal string props** and replaces localized `children` with `null` so hydration does not overwrite translated server-rendered text. Non-string or computed prop values are ignored when hashing for the browser. Use static string text, descriptions, and translatable attributes when you rely on matching generated IDs across server rendering and hydration; prefer an explicit ID for dynamic content.

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

`initializeLocalization` uses the document's `lang` attribute when present; otherwise it uses `defaultLocale`. `setLocale` updates the `lang` attribute, reloads the configured Fluent resources, and translates the connected document. The `localization` property exposes the underlying `DOMLocalization` instance after initialization:

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

Use `defineMessage` to create message descriptors passed between components. Its `MessageDefinition` input requires a `defaultMessage` and optionally accepts an explicit `id` and a `description`. The returned `MessageDescriptor` has `{ readonly id: string; readonly defaultMessage: string | undefined }`: server rendering receives the fallback text, while prepared browser JavaScript omits it.

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

Without an `id`, `defineMessage` generates one using the same sorted-fields SHA-512 hash as generated element IDs. For example:

```tsx
const greeting = defineMessage({
  defaultMessage: 'Welcome!',
  description: 'Greeting on the home page',
})
```

On the server, `defineMessage` returns the ID and source `defaultMessage` so server-rendered elements have fallback content before localization. The JavaScript response transform replaces statically resolvable calls with `{ id: "generated-id" }` (using the actual ID), removing both the call and its message fields from the browser payload. Consequently, `defaultMessage` is typed as `string | undefined`. The transform also changes localized JSX children to `null`, preventing browser hydration from overwriting translated server-rendered text. Explicit string IDs can be reduced even when the remaining fields are dynamic or spread; ID-less calls require static string fields so the browser transform can generate the same ID as the server. `MessageDefinition` and `MessageDescriptor` are both exported as types. Changing `defaultMessage` or `description` changes a generated ID, so use an explicit `id` to keep references stable across copy edits.

## Fluent resources

[Syntax Guide](https://projectfluent.org/fluent/guide/)

```ftl
welcome = Welcome, { $name }!
```

### Extracting source messages

Use the source extractor to generate an FTL template from static `.ts` and `.tsx` messages (it does not read existing translations or overwrite resource files):

```sh
npm run --silent extract -- app > messages.ftl
```

With no argument the command scans `app`; you can also pass individual files or directories. It writes serialized FTL to stdout and extraction diagnostics to stderr. Diagnostics cause a nonzero exit code, so check them before using the output as a complete catalog. Commented-out code is ignored.

The extractor recognizes direct `defineMessage({ defaultMessage: '…', description: '…' })` calls and native JSX elements with `data-l10n`, `data-l10n-description`, or a literal `data-l10n-id`. It collects static text, localizable attributes, and descriptions, and uses the same generated ID function as server localization. Its FTL comments include the message description and each file, line, column, element name (for JSX), and enclosing function or variable. Identical messages with the same ID are combined; conflicting content is reported rather than silently overwritten.

For programmatic use, import `extractMessages` and `serializeMessages` from `@example/fluent-remix/extract`. `extractMessages([{ file, source }])` returns `{ messages, diagnostics }`; `serializeMessages(messages)` creates the FTL template using `@fluent/syntax`.

Only statically determinable content is extracted. Dynamic or nested JSX text, dynamic IDs or descriptions, spread props for generated IDs, and nonliteral `defineMessage` fields produce diagnostics. Explicit-ID elements with dynamic text or attributes can still yield their other static fields. Invalid explicit Fluent IDs are reported instead of emitted. Review these diagnostics and use explicit IDs where static extraction is not possible.

## License

MIT
