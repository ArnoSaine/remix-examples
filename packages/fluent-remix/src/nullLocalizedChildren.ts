import {
  parseSync,
  visitorKeys,
  type CallExpression,
  type Node,
  type ObjectProperty,
} from 'oxc-parser'

function isNamedProperty(property: ObjectProperty, name: string) {
  return (
    !property.computed &&
    ((property.key.type === 'Identifier' && property.key.name === name) ||
      (property.key.type === 'Literal' && property.key.value === name))
  )
}

function isJsxCall(node: Node): node is CallExpression {
  if (node.type !== 'CallExpression') return false
  let { callee } = node
  return callee.type === 'Identifier' && /^(?:_?jsx|_?jsxs|_?jsxDEV)$/.test(callee.name)
}

function nullLocalizedChildrenInSource(source: string) {
  if (!source.includes('data-l10n-id') || !source.includes('children')) return source

  let result = parseSync('response.js', source)
  if (result.errors.length) return source

  let replacements: Array<{ start: number; end: number; text: string }> = []

  function visit(node: Node) {
    if (isJsxCall(node)) {
      let props = node.arguments[1]
      if (props?.type === 'ObjectExpression') {
        let properties = props.properties
        let localized = properties.some(
          (property) => property.type === 'Property' && isNamedProperty(property, 'data-l10n-id'),
        )

        if (localized) {
          for (let property of properties) {
            if (property.type !== 'Property' || !isNamedProperty(property, 'children')) continue
            if (property.value.type === 'Literal' && property.value.value === null) continue

            replacements.push(
              property.shorthand
                ? { start: property.start, end: property.end, text: 'children: null' }
                : { start: property.value.start, end: property.value.end, text: 'null' },
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

  // Replacing a children value also replaces any localized JSX calls inside it.
  replacements.sort((a, b) => a.start - b.start || b.end - a.end)
  let disjoint: typeof replacements = []
  for (let replacement of replacements) {
    if (!disjoint.length || replacement.start >= disjoint[disjoint.length - 1].end) {
      disjoint.push(replacement)
    }
  }
  for (let index = disjoint.length - 1; index >= 0; index--) {
    let { start, end, text } = disjoint[index]
    source = source.slice(0, start) + text + source.slice(end)
  }
  return source
}

// Server-rendered HTML has already been localized, but the browser bundle still
// contains default JSX children. Null localized elements' children so hydration
// does not overwrite translated text or report a hydration mismatch.
export async function nullLocalizedChildren(response: Response) {
  let contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('javascript')) return response

  let source = await response.text()
  let transformed = nullLocalizedChildrenInSource(source)

  return new Response(transformed, response)
}
