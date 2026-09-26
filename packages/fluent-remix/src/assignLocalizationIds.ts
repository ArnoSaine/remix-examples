import type { JSDOM } from 'jsdom'

import { isAttrNameLocalizable } from './isAttrNameLocalizable.ts'

export function assignLocalizationIds(dom: JSDOM) {
  for (let element of dom.window.document.querySelectorAll('[data-l10n]')) {
    if (element.hasAttribute('data-l10n-id')) {
      console.warn(
        `Element contains both data-l10n and data-l10n-id attributes: ${element.outerHTML}. Remove the data-l10n-id or data-l10n attribute to enable/disable automatic id generation for this element.`,
      )
    } else {
      assignLocalizationId(element)
    }
  }

  for (let element of dom.window.document.querySelectorAll(
    '[data-l10n-description]:not([data-l10n-id])',
  )) {
    assignLocalizationId(element)
  }
}

function assignLocalizationId(element: Element) {
  let values: Record<string, string> = {}
  for (let attr of element.getAttributeNames()) {
    if (isAttrNameLocalizable(attr, element)) {
      values[attr] = element.getAttribute(attr)!
    }
  }
  if (element.textContent) {
    values.defaultMessage = element.textContent
  }
  if (element.hasAttribute('data-l10n-description')) {
    values['data-l10n-description'] = element.getAttribute('data-l10n-description')!
  }

  let id = generateId(values)
  element.setAttribute('data-l10n-id', id)

  element.removeAttribute('data-l10n')
  element.removeAttribute('data-l10n-description')
}

export function generateId(value: Record<string, string>) {
  // Create stable keys order by sorting the keys
  value = Object.fromEntries(
    Object.entries(value).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)),
  )

  // Build the content key
  const content = JSON.stringify(value)

  // Hash the string using SHA-512
  const hash = process.getBuiltinModule('crypto').createHash('sha512').update(content)

  // Format as Base64 and clean up URL/filename unsafe characters
  const base64Hash = hash.digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') // Remove padding

  // Truncate to the requested length (6 characters by default)
  return base64Hash.substring(0, 6)
}
