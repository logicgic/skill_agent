import { test, expect } from '@playwright/test'

test('visits chat page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Skill Agent 聊天页')
  await expect(page.locator('textarea')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
})
