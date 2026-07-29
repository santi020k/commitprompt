import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  { name: 'home', path: '/' },
  { name: 'documentation', path: '/docs/' },
  { name: 'not found', path: '/404.html' }
] as const

const themes = ['dark', 'light'] as const

for (const theme of themes) {
  for (const pageUnderTest of pages) {
    test(`${pageUnderTest.name} has no ${theme} theme accessibility violations`, async ({
      page
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(pageUnderTest.path)

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      const results = await new AxeBuilder({ page })
        .withTags([
          'best-practice',
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22aa'
        ])
        .analyze()

      expect(results.violations).toEqual([])
    })
  }
}
