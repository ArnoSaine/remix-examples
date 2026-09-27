import {
  parseSync,
  visitorKeys,
  type CallExpression,
  type Node,
  type ObjectExpression,
  type ObjectProperty,
} from 'oxc-parser'

import { generateId } from './assignLocalizationIds.ts'
import { isAttrNameLocalizableForTag } from './isAttrNameLocalizable.ts'

type Edit = { start: number; end: number; text: string }

function propertyName(property: ObjectProperty): string | undefined {
  if (property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value
  }
}

function stringValue(property: ObjectProperty): string | undefined {
  let value = property.value
  return value.type === 'Literal' && typeof value.value === 'string' ? value.value : undefined
}

function isJsxCall(node: Node): node is CallExpression {
  if (node.type !== 'CallExpression') return false
  let { callee } = node
  return callee.type === 'Identifier' && /^(?:_?jsx|_?jsxs|_?jsxDEV)$/.test(callee.name)
}

function omitProperty(props: ObjectExpression, property: ObjectProperty): Edit {
  let index = props.properties.indexOf(property)
  let next = props.properties[index + 1]
  if (next) return { start: property.start, end: next.start, text: '' }
  let previous = props.properties[index - 1]
  if (previous) return { start: previous.end, end: property.end, text: '' }
  return { start: property.start, end: property.end, text: '' }
}

function prepareSource(source: string) {
  if (!source.includes('data-l10n') && !source.includes('defineMessage')) return source

  let result = parseSync('response.js', source)
  if (result.errors.length) return source

  let edits: Edit[] = []

  function visit(node: Node) {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'defineMessage'
    ) {
      let message = node.arguments[0]
      if (message?.type === 'ObjectExpression') {
        let explicitId = message.properties.find(
          (property) => property.type === 'Property' && propertyName(property) === 'id',
        )
        let explicitIdValue = explicitId?.type === 'Property' ? stringValue(explicitId) : undefined
        if (explicitIdValue) {
          edits.push({
            start: node.start,
            end: node.end,
            text: `{ id: ${JSON.stringify(explicitIdValue)} }`,
          })
        } else if (message.properties.every((property) => property.type === 'Property')) {
          let values: Record<string, string> = {}
          let isStatic = true
          for (let property of message.properties) {
            if (property.type !== 'Property') continue
            let name = propertyName(property)
            let value = stringValue(property)
            if (!name || value === undefined) {
              isStatic = false
              break
            }
            values[name] = value
          }
          // Dynamic expressions cannot be hashed at build time to match defineMessage on the server.
          if (isStatic && Object.hasOwn(values, 'defaultMessage')) {
            edits.push({
              start: node.start,
              end: node.end,
              text: `{ id: ${JSON.stringify(generateId(values))} }`,
            })
          }
        }
      }
    }

    if (isJsxCall(node)) {
      let [tag, props] = node.arguments
      if (props?.type === 'ObjectExpression') {
        let properties = props.properties.filter(
          (property): property is ObjectProperty => property.type === 'Property',
        )
        let byName = (name: string) =>
          properties.find((property) => propertyName(property) === name)
        let marker = byName('data-l10n')
        let explicitId = byName('data-l10n-id')
        let description = byName('data-l10n-description')
        let children = byName('children')

        if ((marker || description) && !explicitId) {
          let values: Record<string, string> = {}
          let tagName = tag?.type === 'Literal' && typeof tag.value === 'string' ? tag.value : ''
          let inputType = byName('type')
          for (let property of properties) {
            let name = propertyName(property)
            let value = stringValue(property)
            if (
              name &&
              value !== undefined &&
              isAttrNameLocalizableForTag(name, tagName, inputType && stringValue(inputType))
            ) {
              values[name] = value
            }
          }
          let message = children && stringValue(children)
          if (message) values.defaultMessage = message
          let descriptionValue = description && stringValue(description)
          if (descriptionValue !== undefined) values['data-l10n-description'] = descriptionValue

          let id = generateId(values)
          let idProperty = marker ?? description!
          edits.push({
            start: idProperty.start,
            end: idProperty.end,
            text: `"data-l10n-id": "${id}"`,
          })
          if (marker && description) edits.push(omitProperty(props, description))
        }

        if ((explicitId || marker || description) && children) {
          if (!(children.value.type === 'Literal' && children.value.value === null)) {
            edits.push(
              children.shorthand
                ? { start: children.start, end: children.end, text: 'children: null' }
                : { start: children.value.start, end: children.value.end, text: 'null' },
            )
          }
        }
      }
    }

    for (let key of visitorKeys[node.type] ?? []) {
      let child = (node as unknown as Record<string, unknown>)[key]
      if (Array.isArray(child)) {
        for (let item of child) {
          if (item && typeof item === 'object' && 'type' in item) visit(item as Node)
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        visit(child as Node)
      }
    }
  }

  visit(result.program)

  // Nulling a parent's children can subsume edits to localized descendants.
  edits.sort((a, b) => a.start - b.start || b.end - a.end)
  let disjoint: Edit[] = []
  for (let edit of edits) {
    if (!disjoint.length || edit.start >= disjoint[disjoint.length - 1].end) disjoint.push(edit)
  }
  for (let index = disjoint.length - 1; index >= 0; index--) {
    let { start, end, text } = disjoint[index]
    source = source.slice(0, start) + text + source.slice(end)
  }
  return source
}

// Match the server's generated localization IDs in browser JSX and message
// descriptors, and suppress default children so translated HTML survives hydration.
export async function prepareLocalizedJavaScript(response: Response) {
  let contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('javascript')) return response

  let source = await response.text()
  return new Response(prepareSource(source), response)
}
