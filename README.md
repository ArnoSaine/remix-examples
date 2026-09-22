# My Remix App

A minimal Remix application starter with a home page.

## Starter Shape

- `app/actions/controller.tsx` owns the top-level route actions.
- `app/actions/home-page.tsx` and `app/actions/document.tsx` render the route-owned starter UI.
- `app/actions/public/` contains the browser runtime entry and interactive prompt button.
- `app/routes.ts` defines the shared route contract used by server and browser modules for type-safe hrefs.
- `app/router.ts` wires routes to handlers and installs the standard Remix UI renderer used by actions.
- `app/assets.ts` owns the server-side asset pipeline used by the asset route and render middleware.
- `packages/fluent-remix/` contains the Fluent integration package.
- Root `public/` contains static files served unchanged from the app root.

## Localization

The app uses [Fluent](https://projectfluent.org/) for translations. Locale resources are Fluent files in `public/locales/`, and the currently supported locales are declared in `app/actions/public/locales.ts`.

For each request, the localization middleware selects a locale in this order:

1. A supported `locale` cookie, when present.
2. The request's `Accept-Language` header.
3. `en-US`, the default locale.

HTML elements with the `data-l10n-id` attribute have their text content and translatable attributes localized on the server. In the browser, those values are updated when the language changes. Example:

```tsx
<h2 data-l10n-id="get-started">Get started</h2>
```

See the [`@example/fluent-remix` package README](packages/fluent-remix/README.md) for installation, API, and integration details. This app configures the package in `app/localization.ts` and `app/actions/public/localization.ts`.

### Add A Locale

1. Add the locale code to `SUPPORTED_LOCALES` in `app/actions/public/locales.ts`.
2. Add a matching Fluent resource at `public/locales/<locale>.ftl`.

## Growing The App

- Put top-level route actions in `app/actions/controller.tsx`.
- Add `app/actions/<route-key>/controller.tsx` when a nested route map needs its own actions or middleware.
- Add directories like `app/data/` or `test/` when the app actually needs them.
- Move shared UI into `app/ui/` once more than one route needs it.

## Commands

```sh
npm i
npm run dev
npm run hmr
npm run start
npm test
npm run typecheck
```
