import { JSDOM } from 'jsdom'
import { parseSync } from 'oxc-parser'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { assignLocalizationIds, generateId } from './assignLocalizationIds.ts'
import { prepareLocalizedJavaScript } from './prepareLocalizedJavaScript.ts'

function javascript(source: string) {
  return new Response(source, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  })
}

async function transform(source: string) {
  let output = await (await prepareLocalizedJavaScript(javascript(source))).text()
  assert.equal(parseSync('output.js', output).errors.length, 0)
  return output
}

describe('prepareLocalizedJavaScript', () => {
  it('replaces ID-less defineMessage descriptors with only the server-generated ID', async () => {
    let greeting = generateId({ defaultMessage: 'Hi' })
    let described = generateId({ defaultMessage: 'Hi', description: 'A greeting message' })
    let output = await transform(`// defineMessage({ defaultMessage: 'In a comment' })
const text = "defineMessage({ defaultMessage: 'In a string' })";
const simple = defineMessage({ defaultMessage: 'Hi' });
const described = defineMessage({ description: 'A greeting message', defaultMessage: 'Hi' });
const reversed = defineMessage({ defaultMessage: 'Hi', description: 'A greeting message' });
const explicit = defineMessage({ id: 'fixed', defaultMessage: 'Visible' });
const other = notDefineMessage({ defaultMessage: 'Unchanged' });`)

    assert.match(output, new RegExp(`const simple = defineMessage\\(\\{ id: "${greeting}" \\}\\)`))
    assert.equal(
      (output.match(new RegExp(`defineMessage\\(\\{ id: "${described}" \\}\\)`, 'g')) ?? []).length,
      2,
    )
    assert.match(output, /defineMessage\(\{ id: 'fixed', defaultMessage: 'Visible' \}\)/)
    assert.match(output, /notDefineMessage\(\{ defaultMessage: 'Unchanged' \}\)/)
    assert.match(output, /\/\/ defineMessage\(\{ defaultMessage: 'In a comment' \}\)/)
    assert.match(output, /const text = "defineMessage\(\{ defaultMessage: 'In a string' \}\)"/)
    assert.doesNotMatch(output, /const simple = defineMessage\(\{ defaultMessage: 'Hi' \}\)/)
  })

  it('leaves dynamic or spread message descriptors untouched', async () => {
    let source = `const dynamic = defineMessage({ defaultMessage: getMessage() });
const description = defineMessage({ defaultMessage: 'Hi', description: getDescription() });
const spread = defineMessage({ ...message, defaultMessage: 'Hi' });
const missing = defineMessage({ description: 'No default' });
const explicit = defineMessage({ id: 'fixed', defaultMessage: 'Hi' });`

    assert.equal(await transform(source), source)
  })

  it('rewrites messages and localized JSX independently in the same module', async () => {
    let messageId = generateId({ defaultMessage: 'Hello' })
    let elementId = generateId({ defaultMessage: 'Welcome' })
    let output = await transform(`const message = defineMessage({ defaultMessage: 'Hello' });
const element = _jsx('p', { 'data-l10n': true, children: 'Welcome' });`)

    assert.match(output, new RegExp(`defineMessage\\(\\{ id: "${messageId}" \\}\\)`))
    assert.match(output, new RegExp(`"data-l10n-id": "${elementId}"`))
    assert.match(output, /children: null/)
  })

  it('matches server-generated IDs and removes generation markers', async () => {
    let dom = new JSDOM(
      '<div data-l10n aria-label="Demo" title="Tip" data-l10n-description="Context">Hello</div>',
    )
    assignLocalizationIds(dom)
    let id = dom.window.document.querySelector('div')!.getAttribute('data-l10n-id')!

    let output = await transform(`const label = _jsx('div', {
      'data-l10n': true, 'aria-label': 'Demo', title: 'Tip',
      'data-l10n-description': 'Context', children: 'Hello', id: 'unrelated'
    });`)

    assert.match(output, new RegExp(`"data-l10n-id": "${id}"`))
    assert.match(output, /children: null/)
    assert.match(output, /id: 'unrelated'/)
    assert.doesNotMatch(output, /'data-l10n': true|'data-l10n-description': 'Context'/)
  })

  it('generates an ID for description alone, ignoring non-string inputs', async () => {
    let id = generateId({ 'data-l10n-description': 'Context', title: 'Tip' })
    let output = await transform(`const element = _jsx('div', {
      title: 'Tip', 'aria-label': expression(),
      'data-l10n-description': 'Context', children: dynamicText,
      style: { color: 'red' }
    });`)

    assert.match(output, new RegExp(`"data-l10n-id": "${id}"`))
    assert.match(output, /children: null/)
    assert.match(output, /'aria-label': expression\(\)/)
    assert.match(output, /style: \{ color: 'red' \}/)
    assert.doesNotMatch(output, /data-l10n-description/)
  })

  it('handles description before the marker and description-only text', async () => {
    let withMarker = generateId({ 'data-l10n-description': 'Hint', defaultMessage: 'Hello' })
    let descriptionOnly = generateId({ 'data-l10n-description': 'Hint', defaultMessage: 'Goodbye' })
    let output = await transform(`const a = _jsx('p', {
      'data-l10n-description': 'Hint', 'data-l10n': true, children: 'Hello'
    });
    const b = _jsx('p', { children: 'Goodbye', 'data-l10n-description': 'Hint' });`)

    assert.match(output, new RegExp(`"data-l10n-id": "${withMarker}"`))
    assert.match(output, new RegExp(`"data-l10n-id": "${descriptionOnly}"`))
    assert.equal((output.match(/children: null/g) ?? []).length, 2)
    assert.doesNotMatch(output, /data-l10n-description|data-l10n': true/)
  })

  it('ignores non-string descriptions and attributes in the hash', async () => {
    let id = generateId({ defaultMessage: 'Text' })
    let output = await transform(`_jsx('div', {
      'data-l10n': true, 'data-l10n-description': getDescription(),
      'aria-label': label, children: 'Text'
    })`)

    assert.match(output, new RegExp(`"data-l10n-id": "${id}"`))
    assert.doesNotMatch(output, /data-l10n-description|getDescription\(\)/)
  })

  it('matches HTML input value rules and ignores unrelated attributes', async () => {
    let dom = new JSDOM(
      '<input data-l10n type="submit" value="Send" placeholder="Hint" class="button">',
    )
    assignLocalizationIds(dom)
    let id = dom.window.document.querySelector('input')!.getAttribute('data-l10n-id')!

    let output = await transform(
      `_jsx('input', { 'data-l10n': true, type: 'submit', value: 'Send', placeholder: 'Hint', class: 'button' });`,
    )
    assert.match(output, new RegExp(`"data-l10n-id": "${id}"`))
    assert.match(output, /value: 'Send'/)
    assert.match(output, /class: 'button'/)
  })

  it('nulls explicit-id children without replacing an explicit ID or warning-case markers', async () => {
    let output = await transform(`// _jsx('div', { 'data-l10n': true, children: 'Comment' })
const text = 'data-l10n children';
const first = _jsx('span', { 'data-l10n-id': 'first', children: 'First', title: 'keep' });
const middle = _jsxs('div', { id: 'middle', children: label(), 'data-l10n-id': id, role: 'group' });
const last = _jsx('p', { title: 'last', 'data-l10n-id': 'last', children: props.text, });
const warning = _jsx('div', { 'data-l10n': true, 'data-l10n-id': 'fixed', children: 'Keep id' });
const other = _jsx('span', { children: 'Unlocalized' });
const unrelated = make({ 'data-l10n': true, 'data-l10n-id': 'not-an-element', children: 'Keep' });`)

    assert.match(output, /\/\/ _jsx\('div', \{ 'data-l10n': true, children: 'Comment' \}\)/)
    assert.match(output, /const text = 'data-l10n children'/)
    assert.match(output, /'data-l10n-id': 'first', children: null, title: 'keep'/)
    assert.match(output, /children: null, 'data-l10n-id': id, role: 'group'/)
    assert.match(output, /'data-l10n-id': 'last', children: null,/)
    assert.match(output, /'data-l10n': true, 'data-l10n-id': 'fixed', children: null/)
    assert.match(output, /_jsx\('span', \{ children: 'Unlocalized' \}\)/)
    assert.match(
      output,
      /make\(\{ 'data-l10n': true, 'data-l10n-id': 'not-an-element', children: 'Keep' \}\)/,
    )
  })

  it('handles nested localized children without overlapping edits', async () => {
    let output = await transform(`_jsxs('div', { 'data-l10n': true, children: [
      _jsx('span', { 'data-l10n': true, children: 'Inner' }),
      _jsx('span', { 'data-l10n-id': 'also-inner', children: 'Other' })
    ] });
    _jsx('p', { 'data-l10n-id': 'sibling', children: 'Sibling' });`)

    assert.match(output, new RegExp(`"data-l10n-id": "${generateId({})}"`))
    assert.doesNotMatch(output, /Inner|Other|Sibling/)
    assert.match(output, /'data-l10n-id': 'sibling', children: null/)
  })

  it('preserves missing and already-null children and expands shorthand children', async () => {
    let output = await transform(`const a = _jsx('span', { 'data-l10n-id': 'missing' });
const b = _jsx('span', { 'data-l10n-id': 'already-null', children: null });
const c = _jsx('span', { 'data-l10n-id': 'shorthand', children });`)

    assert.match(output, /'data-l10n-id': 'missing' \}/)
    assert.match(output, /'data-l10n-id': 'already-null', children: null \}/)
    assert.match(output, /'data-l10n-id': 'shorthand', children: null \}/)
  })

  it('preserves non-JavaScript responses and unchanged JavaScript', async () => {
    let html = new Response('<div data-l10n="x">Keep</div>', {
      headers: { 'Content-Type': 'text/html' },
    })
    assert.equal(await prepareLocalizedJavaScript(html), html)

    let unchanged = javascript(`_jsx('span', { children: 'Keep' });`)
    let output = await prepareLocalizedJavaScript(unchanged)
    assert.equal(output.headers.get('Content-Type'), unchanged.headers.get('Content-Type'))
    assert.equal(await output.text(), `_jsx('span', { children: 'Keep' });`)
  })

  it('does not modify invalid JavaScript', async () => {
    let source = `_jsx('span', { 'data-l10n': true, children: 'Keep' }`
    assert.equal(await (await prepareLocalizedJavaScript(javascript(source))).text(), source)
  })
})
