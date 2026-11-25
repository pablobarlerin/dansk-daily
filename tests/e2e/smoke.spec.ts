import { expect, test } from '@playwright/test'

test('first launch opens Welcome', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Learn Danish, 15 minutes a day' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Find my level' })).toBeVisible()
  expect(errors).toEqual([])
})
