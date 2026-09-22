# Remix v3 examples

A collection of small Remix v3 applications extending the official Remix example.

## Examples

### Fluent localization ([`my-remix-app/fluent`](../../tree/my-remix-app/fluent), [diff](../../compare/my-remix-app/default..my-remix-app/fluent))

- [Fluent](https://projectfluent.org/) translations from `.ftl` files, applied with `data-l10n-id` attributes, e.g.
  ```tsx
  <h2 data-l10n-id="get-started">Get started</h2>
  ```
- default locale detection via the `Accept-Language` header
- a cookie-based language selector
- English and Spanish translations
