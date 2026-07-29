import { expect, test } from '@playwright/test'

const pages = ['/', '/docs/', '/404.html'] as const
const screenSizes = [
  { height: 900, name: 'narrow mobile', width: 320 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 768, name: 'small desktop', width: 1024 }
] as const

for (const viewport of screenSizes) {
  test(`pages fit the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)

    for (const path of pages) {
      await page.goto(path)

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
    }
  })
}

test('documentation navigation stays compact on narrow screens', async ({
  page
}) => {
  await page.setViewportSize({ height: 900, width: 320 })
  await page.goto('/docs/')

  const sidebar = page.locator('.docs-sidebar')
  const navigation = sidebar.locator('nav')

  await expect(sidebar).toBeInViewport()
  await expect(navigation).toHaveCSS('display', 'flex')
  await expect(navigation.locator('p').first()).toBeHidden()

  const box = await sidebar.boundingBox()

  expect(box?.height).toBeLessThan(160)
})
