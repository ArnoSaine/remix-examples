import { parse } from '@fluent/syntax'
import { JSDOM } from 'jsdom'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { assignLocalizationIds, generateId } from './assignLocalizationIds.ts'
import { extractMessages, serializeMessages } from './extractMessages.ts'

describe('extractMessages', () => {
  it('extracts static JSX, attributes, descriptions and locations with server IDs', () => {
    let file = 'app/actions/page.tsx'
    let source = `function Page() {
  return <>
    <p data-l10n title="Greeting" data-l10n-description="Used on home page">
      Welcome &amp; enjoy
    </p>
    <img data-l10n-id="logo" src="/logo.svg" alt="Brand" />
    <section data-l10n-id="masthead" aria-label={'Home'} />
    <input data-l10n type="submit" value="Send" />
  </>
}`
    let dom = new JSDOM(
      '<p data-l10n title="Greeting" data-l10n-description="Used on home page">Welcome &amp; enjoy</p>',
    )
    assignLocalizationIds(dom)
    let expected = dom.window.document.querySelector('p')!.getAttribute('data-l10n-id')
    let { messages, diagnostics } = extractMessages([{ file, source }])

    assert.equal(diagnostics.length, 0)
    assert.equal(messages.length, 4)
    assert.equal(messages[0].id, expected)
    assert.equal(messages[0].defaultMessage, 'Welcome & enjoy')
    assert.equal(messages[0].description, 'Used on home page')
    assert.equal(messages[0].attributes.title, 'Greeting')
    assert.equal(messages[0].references[0].file, file)
    assert.equal(messages[0].references[0].line, 3)
    assert.equal(messages[0].references[0].element, 'p')
    assert.equal(messages[0].references[0].context, 'Page')
    assert.equal(messages[1].attributes.alt, 'Brand')
    assert.equal(messages[1].defaultMessage, undefined)
    assert.equal(messages[2].attributes['aria-label'], 'Home')
    assert.equal(messages[3].id, generateId({ value: 'Send' }))
    assert.equal(messages[3].id, 'm54IsAX')

    let ftl = serializeMessages(messages)
    let resource = parse(ftl, {})
    assert.equal(resource.body.length, 4)
    assert.match(ftl, /# Description: Used on home page/)
    assert.match(ftl, /# Source: app\/actions\/page.tsx:3:\d+ <p> in Page/)
    assert.match(ftl, /\.aria-label = Home/)
    assert.match(ftl, /\.alt = Brand/)
    assert.match(ftl, /\.value = Send/)
    assert.match(ftl, /Welcome & enjoy/)
  })

  it('extracts explicit and generated defineMessage calls with source context', () => {
    let source = `// defineMessage({ defaultMessage: 'Commented' })
const literal = "defineMessage({ defaultMessage: 'String' })";
function getGreeting() {
  return defineMessage({ defaultMessage: 'Hello', description: 'Warm greeting' })
}
const farewell = defineMessage({ id: 'farewell', defaultMessage: 'Goodbye' });`
    let { messages, diagnostics } = extractMessages([{ file: 'app/messages.ts', source }])

    assert.equal(diagnostics.length, 0)
    assert.equal(messages.length, 2)
    assert.equal(
      messages[0].id,
      generateId({ defaultMessage: 'Hello', description: 'Warm greeting' }),
    )
    assert.equal(messages[0].references[0].context, 'getGreeting')
    assert.equal(messages[0].references[0].line, 4)
    assert.equal(messages[1].id, 'farewell')
    assert.equal(messages[1].references[0].context, 'farewell')
    assert.match(serializeMessages(messages), /# Description: Warm greeting/)
  })

  it('deduplicates identical IDs and reports conflicting translations', () => {
    let files = [
      { file: 'a.tsx', source: `<p data-l10n-id="shared">Hi</p>` },
      {
        file: 'b.tsx',
        source: `<><p data-l10n-id="shared">Hi</p><p data-l10n-id="shared">Bye</p></>`,
      },
    ]
    let { messages, diagnostics } = extractMessages(files)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].references.length, 2)
    assert.equal(diagnostics.length, 1)
    assert.match(diagnostics[0].message, /Conflicting source messages/)
  })

  it('deduplicates equivalent attributes in any source order', () => {
    let { messages, diagnostics } = extractMessages([
      { file: 'a.tsx', source: `<p data-l10n-id="same" title="Title" aria-label="Label" />` },
      { file: 'b.tsx', source: `<p data-l10n-id="same" aria-label="Label" title="Title" />` },
    ])
    assert.equal(messages.length, 1)
    assert.equal(messages[0].references.length, 2)
    assert.equal(diagnostics.length, 0)
  })

  it('skips dynamic generated IDs and values rather than hashing an incomplete message', () => {
    let source = `<>
  <p data-l10n>{name}</p>
  <img data-l10n alt={label} />
  <div data-l10n-description={context}>Hi</div>
  <div data-l10n-id={id}>Dynamic id</div>
  <p data-l10n-id="partial" title={tooltip}>Fixed</p>
  <p data-l10n><b>Nested</b></p>
  {defineMessage({ defaultMessage: getText() })}
  {defineMessage({ defaultMessage: 'Static', description: dynamic })}
</>`
    let { messages, diagnostics } = extractMessages([{ file: 'dynamic.tsx', source }])
    assert.equal(messages.length, 1)
    assert.equal(messages[0].id, 'partial')
    assert.equal(messages[0].defaultMessage, 'Fixed')
    assert.equal(messages[0].attributes.title, undefined)
    assert.equal(diagnostics.length, 8)
  })

  it('serializes literal braces and multiline text as valid Fluent syntax', () => {
    let { messages } = extractMessages([
      { file: 'copy.tsx', source: `<p data-l10n-id="braces">Use {"{"}name{"}"} here</p>` },
    ])
    let ftl = serializeMessages(messages)
    assert.equal(messages[0].defaultMessage, 'Use {name} here')
    assert.equal(parse(ftl, {}).body.length, 1)
    assert.match(ftl, /\{ "\{" \}/)
  })
})
