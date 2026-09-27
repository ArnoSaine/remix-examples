import { defineMessage, type MessageDescriptor } from '@example/fluent-remix'
import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'
import { localization } from '../localization.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: MessageDescriptor
}

const DEFAULT_TITLE = defineMessage({
  id: 'title',
  defaultMessage: 'My Remix App',
})

export function Document(handle: Handle<DocumentProps>) {
  let { locale } = localization(handle)
  return () => {
    let { children, head, title = DEFAULT_TITLE } = handle.props
    let { href, importMap, preloads } = scriptEntry

    return (
      <html lang={locale}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <title data-l10n-id={title.id}>{title.defaultMessage}</title>
          {head}
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>
        </head>
        <body mix={css({ margin: 0 })}>{children}</body>
      </html>
    )
  }
}
