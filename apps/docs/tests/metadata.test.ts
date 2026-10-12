import { expect, test } from '@playwright/test'

for (const pathname of ['/', '/docs/']) {
  test(`production metadata is complete for ${pathname}`, async ({ page }) => {
    await page.goto(pathname)

    const canonical = `https://commitprompt.santi020k.com${pathname}`

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index,\s*follow(?:,|$)/)

    await expect(page.locator('meta[name="twitter:url"]')).toHaveAttribute('content', canonical)
  })
}

test('the not-found page remains excluded from indexing', async ({ page }) => {
  await page.goto('/404/')

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/)

  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)

  await expect(page.locator('meta[name="twitter:url"]')).toHaveCount(0)
})
