import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { generateId } from './assignLocalizationIds.ts'
import { defineMessage, type MessageDescriptor } from './index.ts'

describe('defineMessage', () => {
  it('returns an explicit ID with its server fallback', () => {
    let message: MessageDescriptor = defineMessage({
      id: 'welcome',
      defaultMessage: 'Welcome',
      description: 'Greeting',
    })

    assert.deepEqual(message, { id: 'welcome', defaultMessage: 'Welcome' })
  })

  it('returns a generated ID with its server fallback', () => {
    let definition = { defaultMessage: 'Welcome', description: 'Greeting' }
    assert.deepEqual(defineMessage(definition), {
      id: generateId(definition),
      defaultMessage: 'Welcome',
    })
  })
})
