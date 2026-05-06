import { test, expect } from '@playwright/test'

/**
 * 聊天首页基础可用性测试。
 *
 * @remarks
 * 校验首屏标题、输入框和发送按钮可见。
 */
test('visits chat page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Skill Agent 聊天页')
  await expect(page.locator('textarea')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
})
