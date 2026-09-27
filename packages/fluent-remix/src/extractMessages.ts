import {
  Attribute,
  Comment,
  Identifier,
  Message,
  Pattern,
  Placeable,
  Resource,
  StringLiteral,
  TextElement,
  serialize,
} from '@fluent/syntax'
import { JSDOM } from 'jsdom'
import {
  parseSync,
  visitorKeys,
  type CallExpression,
  type JSXAttribute,
  type JSXChild,
  type JSXElement,
  type Node,
  type ObjectProperty,
} from 'oxc-parser'

import { generateId } from './assignLocalizationIds.ts'
import { isAttrNameLocalizableForTag } from './isAttrNameLocalizable.ts'

export interface SourceFile {
  file: string
  source: string
}

export interface MessageReference {
  file: string
  line: number
  column: number
  element?: string
  context?: string
}

export interface ExtractedMessage {
  id: string
  defaultMessage?: string
  attributes: Record<string, string>
  description?: string
  references: MessageReference[]
}

export interface ExtractionDiagnostic {
  message: string
  reference: MessageReference
}

export interface ExtractionResult {
  messages: ExtractedMessage[]
  diagnostics: ExtractionDiagnostic[]
}

function staticString(node: Node | null | undefined): string | undefined {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined
  }
  if (node?.type === 'JSXExpressionContainer') return staticString(node.expression)
}

function propertyName(property: ObjectProperty): string | undefined {
  if (property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  return staticString(property.key)
}

function jsxAttributeName(attribute: JSXAttribute): string | undefined {
  return attribute.name.type === 'JSXIdentifier' ? attribute.name.name : undefined
}

// The JSX whitespace folding rules used for text-only JSX children.
function jsxText(value: string): string {
  let lines = value.replace(/\r\n?/g, '\n').split('\n')
  let last = lines.length - 1
  while (last > 0 && !lines[last].trim()) last--
  let result = ''
  for (let index = 0; index <= last; index++) {
    let line = lines[index]
    if (index > 0) line = line.replace(/^\s+/, '')
    if (index < lines.length - 1) line = line.replace(/\s+$/, '')
    if (line) result += line + (index < last ? ' ' : '')
  }
  return result
}

function elementText(children: JSXChild[], decode: (value: string) => string) {
  let text = ''
  for (let child of children) {
    if (child.type === 'JSXText') text += decode(jsxText(child.value))
    else if (
      child.type === 'JSXExpressionContainer' &&
      child.expression.type === 'JSXEmptyExpression'
    ) {
      continue // JSX comments do not contribute text.
    } else if (child.type === 'JSXExpressionContainer') {
      let literal = staticString(child.expression)
      if (literal === undefined) return { dynamic: true, text: '' }
      text += literal
    } else {
      // Nested JSX and spreads require rendering to know the final textContent.
      return { dynamic: true, text: '' }
    }
  }
  return { dynamic: false, text }
}

function contextName(ancestors: Node[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    let node = ancestors[index]
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') return node.id.name
    if (node.type === 'FunctionExpression' && node.id?.type === 'Identifier') return node.id.name
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name
  }
}

/** Extracts statically known source messages; never evaluates JavaScript or JSX. */
export function extractMessages(files: Iterable<SourceFile>): ExtractionResult {
  let messages = new Map<string, ExtractedMessage>()
  let diagnostics: ExtractionDiagnostic[] = []

  for (let { file, source } of files) {
    let parsed = parseSync(file, source)
    let lineStarts = [0]
    for (let index = 0; index < source.length; index++) {
      if (source[index] === '\n') lineStarts.push(index + 1)
    }
    function reference(offset: number, ancestors: Node[], element?: string): MessageReference {
      let low = 0
      let high = lineStarts.length
      while (low + 1 < high) {
        let middle = (low + high) >>> 1
        if (lineStarts[middle] <= offset) low = middle
        else high = middle
      }
      return {
        file,
        line: low + 1,
        column: offset - lineStarts[low] + 1,
        ...(element ? { element } : {}),
        ...(contextName(ancestors) ? { context: contextName(ancestors) } : {}),
      }
    }
    function warn(message: string, ref: MessageReference) {
      diagnostics.push({ message, reference: ref })
    }
    if (parsed.errors.length) {
      for (let error of parsed.errors)
        warn(`Parse error: ${error.message}`, reference(error.labels[0]?.start ?? 0, []))
      continue
    }

    // Parse JSX entities according to HTML rules (e.g. &copy; → ©).
    let html: JSDOM | undefined
    function decode(value: string) {
      if (!value.includes('&')) return value
      html ??= new JSDOM('')
      let textarea = html.window.document.createElement('textarea')
      textarea.innerHTML = value
      return textarea.value
    }

    function add(message: ExtractedMessage) {
      if (!/^[a-zA-Z][\w-]*$/.test(message.id)) {
        warn(`Invalid Fluent message ID: ${message.id}`, message.references[0])
        return
      }
      let current = messages.get(message.id)
      let sameAttributes =
        current &&
        Object.keys(current.attributes).length === Object.keys(message.attributes).length &&
        Object.entries(current.attributes).every(
          ([name, value]) => message.attributes[name] === value,
        )
      if (!current) {
        messages.set(message.id, message)
      } else if (
        current.defaultMessage !== message.defaultMessage ||
        current.description !== message.description ||
        !sameAttributes
      ) {
        warn(`Conflicting source messages for ID ${message.id}`, message.references[0])
      } else {
        current.references.push(...message.references)
      }
    }

    function extractElement(element: JSXElement, ancestors: Node[]) {
      let name = element.openingElement.name
      if (name.type !== 'JSXIdentifier') return
      let tag = name.name
      let ref = reference(element.openingElement.start, ancestors, tag)
      let attributes = element.openingElement.attributes
      let byName = (key: string) =>
        attributes.find(
          (attr) => attr.type === 'JSXAttribute' && jsxAttributeName(attr) === key,
        ) as JSXAttribute | undefined
      let marker = byName('data-l10n')
      let idAttribute = byName('data-l10n-id')
      let descriptionAttribute = byName('data-l10n-description')
      if (!marker && !idAttribute && !descriptionAttribute) return
      if (tag !== tag.toLowerCase()) {
        warn('Cannot statically extract a component element; use a native HTML element', ref)
        return
      }

      let id = idAttribute && staticString(idAttribute.value)
      if (idAttribute && id === undefined) {
        warn('Dynamic data-l10n-id cannot be extracted', ref)
        return
      }
      if (marker && idAttribute)
        warn('Both data-l10n and data-l10n-id are set; using the explicit ID', ref)
      let description = descriptionAttribute && staticString(descriptionAttribute.value)
      if (descriptionAttribute && description === undefined && !idAttribute) {
        warn('Dynamic data-l10n-description cannot be used to generate an ID', ref)
        return
      }
      let generated = !idAttribute && (marker || descriptionAttribute)
      if (generated && attributes.some((attr) => attr.type === 'JSXSpreadAttribute')) {
        warn('Spread attributes prevent static ID generation', ref)
        return
      }
      let inputType = byName('type') && staticString(byName('type')!.value)
      let localizable: Record<string, string> = {}
      for (let attribute of attributes) {
        if (attribute.type !== 'JSXAttribute') continue
        let attrName = jsxAttributeName(attribute)
        if (!attrName || !isAttrNameLocalizableForTag(attrName, tag, inputType)) continue
        let value = staticString(attribute.value)
        if (value === undefined) {
          warn(`Dynamic ${attrName} cannot be extracted${generated ? ' or hashed' : ''}`, ref)
          if (generated) return
        } else {
          localizable[attrName] = decode(value)
        }
      }

      let children = elementText(element.children, decode)
      if (children.dynamic) {
        warn(`Dynamic or nested children cannot be extracted${generated ? ' or hashed' : ''}`, ref)
        if (generated) return
      }
      let defaultMessage = children.dynamic ? undefined : children.text || undefined
      if (generated) {
        let values = { ...localizable }
        if (defaultMessage) values.defaultMessage = defaultMessage
        if (description !== undefined) values['data-l10n-description'] = description
        id = generateId(values)
      }
      if (!id || (!defaultMessage && !Object.keys(localizable).length)) {
        warn('No static localizable content to extract', ref)
        return
      }
      add({
        id,
        ...(defaultMessage ? { defaultMessage } : {}),
        attributes: localizable,
        ...(description !== undefined ? { description } : {}),
        references: [ref],
      })
    }

    function extractCall(call: CallExpression, ancestors: Node[]) {
      if (call.callee.type !== 'Identifier' || call.callee.name !== 'defineMessage') return
      let ref = reference(call.start, ancestors)
      let object = call.arguments[0]
      if (
        object?.type !== 'ObjectExpression' ||
        object.properties.some((p) => p.type !== 'Property')
      ) {
        warn('defineMessage requires a static object literal to extract', ref)
        return
      }
      let fields: Record<string, string> = {}
      for (let property of object.properties) {
        if (property.type !== 'Property') continue
        let name = propertyName(property)
        let value = staticString(property.value)
        if (!name || value === undefined) {
          warn('Dynamic defineMessage field cannot be extracted', ref)
          return
        }
        fields[name] = value
      }
      if (!Object.hasOwn(fields, 'defaultMessage')) {
        warn('defineMessage has no static defaultMessage', ref)
        return
      }
      let id = fields.id || generateId(fields)
      add({
        id,
        defaultMessage: fields.defaultMessage,
        attributes: {},
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        references: [ref],
      })
    }

    function visit(node: Node, ancestors: Node[]) {
      if (node.type === 'JSXElement') extractElement(node, ancestors)
      if (node.type === 'CallExpression') extractCall(node, ancestors)
      ancestors.push(node)
      for (let key of visitorKeys[node.type] ?? []) {
        let child = (node as unknown as Record<string, unknown>)[key]
        if (Array.isArray(child)) {
          for (let item of child)
            if (item && typeof item === 'object' && 'type' in item) visit(item as Node, ancestors)
        } else if (child && typeof child === 'object' && 'type' in child) {
          visit(child as Node, ancestors)
        }
      }
      ancestors.pop()
    }
    visit(parsed.program, [])
  }

  return { messages: [...messages.values()], diagnostics }
}

function pattern(value: string): Pattern {
  // Braces in literal copy are not Fluent placeables.
  let elements: Array<TextElement | Placeable> = []
  for (let part of value.split(/([{}])/)) {
    if (part === '{' || part === '}') elements.push(new Placeable(new StringLiteral(part)))
    else if (part) elements.push(new TextElement(part))
  }
  return new Pattern(elements)
}

/** Serializes extracted defaults to an FTL template with translator context. */
export function serializeMessages(messages: Iterable<ExtractedMessage>): string {
  let entries: Message[] = []
  for (let message of messages) {
    let notes: string[] = []
    if (message.description) notes.push(`Description: ${message.description.replace(/\s+/g, ' ')}`)
    for (let ref of message.references) {
      notes.push(
        `Source: ${ref.file}:${ref.line}:${ref.column}${ref.element ? ` <${ref.element}>` : ''}${ref.context ? ` in ${ref.context}` : ''}`,
      )
    }
    entries.push(
      new Message(
        new Identifier(message.id),
        message.defaultMessage !== undefined ? pattern(message.defaultMessage) : null,
        Object.entries(message.attributes).map(
          ([name, value]) => new Attribute(new Identifier(name), pattern(value)),
        ),
        notes.length ? new Comment(notes.join('\n')) : null,
      ),
    )
  }
  return serialize(new Resource(entries), {})
}
