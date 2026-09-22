import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'

describe('root controller', () => {
  it('GET / returns the home page', async () => {
    let response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))

    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type') ?? '', /text\/html/)
    assert.match(await response.text(), /<html[\s>]/)
  })

  it('GET / renders the requested supported locale', async () => {
    let response = await router.fetch(
      new Request(new URL(routes.home.href(), 'http://localhost'), {
        headers: { 'Accept-Language': 'es' },
      }),
    )

    assert.equal(response.status, 200)
    assert.match(response.headers.get('Vary') ?? '', /Accept-Language/)
    assert.match(response.headers.get('Vary') ?? '', /Cookie/)
    let html = await response.text()
    assert.match(html, /<html lang="es">/)
    assert.match(html, /Te damos la bienvenida a/)
    assert.match(html, /Primeros pasos/)
    assert.match(html, /aria-label="Enlaces sociales de Remix"/)
    assert.doesNotMatch(html, /Welcome to/)
  })

  it('GET / prefers the saved locale cookie', async () => {
    let response = await router.fetch(
      new Request(new URL(routes.home.href(), 'http://localhost'), {
        headers: { 'Accept-Language': 'en-US', Cookie: 'locale=es' },
      }),
    )

    let html = await response.text()
    assert.match(html, /<html lang="es">/)
    assert.match(html, /Te damos la bienvenida a/)
  })
})
