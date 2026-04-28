import { test, expect } from '@playwright/test'

test('visits chat page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Skill Agent')
  await expect(page.locator('textarea')).toBeVisible()
  await expect(page.locator('button.send-button')).toBeVisible()
})
