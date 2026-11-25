import { expect, it } from 'vitest'
import { loadContent } from '../../src/content/load'
import { validateContent } from '../../src/content/validate'

it('real unit files pass validation', () => {
  expect(validateContent(loadContent().units)).toEqual([])
})
