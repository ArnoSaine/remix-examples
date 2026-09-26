// https://github.com/projectfluent/fluent.js/blob/9a925d2a38b893be735ff4429be8ad62132a204d/fluent-dom/src/overlay.js

const LOCALIZABLE_ATTRIBUTES = {
  'http://www.w3.org/1999/xhtml': {
    global: ['title', 'aria-description', 'aria-label', 'aria-valuetext'],
    a: ['download'],
    area: ['download', 'alt'],
    // value is special-cased in isAttrNameLocalizable
    input: ['alt', 'placeholder'],
    menuitem: ['label'],
    menu: ['label'],
    optgroup: ['label'],
    option: ['label'],
    track: ['label'],
    img: ['alt'],
    textarea: ['placeholder'],
    th: ['abbr'],
  },
  'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul': {
    global: ['accesskey', 'aria-label', 'aria-valuetext', 'label', 'title', 'tooltiptext'],
    description: ['value'],
    key: ['key', 'keycode'],
    label: ['value'],
    textbox: ['placeholder', 'value'],
  },
}

export function isAttrNameLocalizable(
  name: string,
  element: Element,
  explicitlyAllowed: any = null,
) {
  if (explicitlyAllowed && explicitlyAllowed.includes(name)) {
    return true
  }

  return isAttrNameLocalizableForTag(
    name,
    element.localName,
    (element as HTMLInputElement).type,
    element.namespaceURI,
  )
}

export function isAttrNameLocalizableForTag(
  name: string,
  tagName: string,
  inputType?: string,
  namespaceURI: string | null = 'http://www.w3.org/1999/xhtml',
) {
  const allowed = LOCALIZABLE_ATTRIBUTES[namespaceURI as keyof typeof LOCALIZABLE_ATTRIBUTES] as any
  if (!allowed) {
    return false
  }

  const attrName = name.toLowerCase()
  const elemName = tagName.toLowerCase()

  // Is it a globally safe attribute?
  if (allowed.global.includes(attrName)) {
    return true
  }

  // Are there no allowed attributes for this element?
  if (!allowed[elemName]) {
    return false
  }

  // Is it allowed on this element?
  if (allowed[elemName].includes(attrName)) {
    return true
  }

  // Special case for value on HTML inputs with type button, reset, submit
  if (
    namespaceURI === 'http://www.w3.org/1999/xhtml' &&
    elemName === 'input' &&
    attrName === 'value'
  ) {
    const type = inputType?.toLowerCase()
    if (type === 'submit' || type === 'button' || type === 'reset') {
      return true
    }
  }

  return false
}
