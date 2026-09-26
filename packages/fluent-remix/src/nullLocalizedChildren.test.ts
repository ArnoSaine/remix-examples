import { parseSync } from 'oxc-parser'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { nullLocalizedChildren } from './nullLocalizedChildren.ts'

function javascript(source: string) {
  return new Response(source, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  })
}

describe('nullLocalizedChildren', () => {
  it('sets children to null on localized JSX elements but leaves other props and calls intact', async () => {
    let source = `// 😀 data-l10n-id and children: "commented out"
const text = 'data-l10n-id children';
const first = _jsx('span', { 'data-l10n-id': 'first', children: 'First', title: 'keep' });
const middle = _jsxs('div', { id: 'middle', children: label(), 'data-l10n-id': id, role: 'group' });
const last = _jsx('p', { title: 'last', 'data-l10n-id': 'last', children: props.text, });
const other = _jsx('span', { children: 'Unlocalized' });
const unrelated = make({ 'data-l10n-id': 'not-an-element', children: 'Keep' });
`

    let response = await nullLocalizedChildren(javascript(source))
    let output = await response.text()

    assert.equal(response.headers.get('Content-Length'), null)
    assert.equal(parseSync('output.js', output).errors.length, 0)
    assert.match(output, /\/\/ 😀 data-l10n-id and children: "commented out"/)
    assert.match(output, /const text = 'data-l10n-id children'/)
    assert.match(
      output,
      /_jsx\('span', \{ 'data-l10n-id': 'first', children: null, title: 'keep' \}\)/,
    )
    assert.match(
      output,
      /_jsxs\('div', \{ id: 'middle', children: null, 'data-l10n-id': id, role: 'group' \}\)/,
    )
    assert.match(
      output,
      /_jsx\('p', \{ title: 'last', 'data-l10n-id': 'last', children: null, \}\)/,
    )
    assert.match(output, /_jsx\('span', \{ children: 'Unlocalized' \}\)/)
    assert.match(output, /make\(\{ 'data-l10n-id': 'not-an-element', children: 'Keep' \}\)/)
  })

  it('handles nested localized children without overlapping edits', async () => {
    let source = `_jsxs('div', { 'data-l10n-id': 'outer', children: [
      _jsx('span', { 'data-l10n-id': 'inner', children: 'Inner' }),
      _jsx('span', { 'data-l10n-id': 'also-inner', children: 'Other' })
    ] });
    _jsx('p', { 'data-l10n-id': 'sibling', children: 'Sibling' });`

    let output = await (await nullLocalizedChildren(javascript(source))).text()

    assert.equal(parseSync('output.js', output).errors.length, 0)
    assert.doesNotMatch(output, /Inner|Other|Sibling/)
    assert.match(output, /'data-l10n-id': 'outer', children: null/)
    assert.match(output, /'data-l10n-id': 'sibling', children: null/)
  })

  it('preserves missing and already-null children and expands shorthand children', async () => {
    let source = `const a = _jsx('span', { 'data-l10n-id': 'missing' });
const b = _jsx('span', { 'data-l10n-id': 'already-null', children: null });
const c = _jsx('span', { 'data-l10n-id': 'shorthand', children });`

    let output = await (await nullLocalizedChildren(javascript(source))).text()

    assert.equal(parseSync('output.js', output).errors.length, 0)
    assert.match(output, /'data-l10n-id': 'missing' \}/)
    assert.match(output, /'data-l10n-id': 'already-null', children: null \}/)
    assert.match(output, /'data-l10n-id': 'shorthand', children: null \}/)
  })

  it('preserves non-JavaScript responses and unchanged JavaScript', async () => {
    let html = new Response('<div data-l10n-id="x">Keep</div>', {
      headers: { 'Content-Type': 'text/html' },
    })
    assert.equal(await nullLocalizedChildren(html), html)

    let unchanged = javascript(`_jsx('span', { children: 'Keep' });`)
    let output = await nullLocalizedChildren(unchanged)
    assert.equal(output.headers.get('Content-Type'), unchanged.headers.get('Content-Type'))
    assert.equal(await output.text(), `_jsx('span', { children: 'Keep' });`)
  })

  it('does not modify invalid JavaScript', async () => {
    let source = `_jsx('span', { 'data-l10n-id': 'x', children: 'Keep' }`
    assert.equal(await (await nullLocalizedChildren(javascript(source))).text(), source)
  })
})
