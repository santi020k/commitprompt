import { expect, test } from '@playwright/test'

for (const theme of ['dark', 'light'] as const) {
  test(`navigation keeps the ${theme} appearance and reinitializes controls`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })

    await page.goto('/')

    await page.evaluate(() => Object.defineProperty(window, '__commitpromptNavigationProbe', { value: true }))

    await page.getByRole('tab', { exact: true, name: 'npm' }).click()

    await page.locator('.primary-nav').getByRole('link', { exact: true, name: 'Docs' }).click()

    await expect(page).toHaveURL(/\/docs\/$/)

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    await expect(page.locator('.primary-nav').getByRole('link', { exact: true, name: 'Docs' })).toHaveAttribute('aria-current', 'page')

    expect(await page.evaluate(() => '__commitpromptNavigationProbe' in window)).toBe(true)

    const installTabs = page.getByRole('tablist', { name: 'Install Commitprompt' })

    await expect(installTabs.getByRole('tab', { exact: true, name: 'npm' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Toggle color theme' }).click()

    const nextTheme = theme === 'dark' ? 'light' : 'dark'

    await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme)

    await page.getByRole('banner').getByRole('link', { name: 'Commitprompt home' }).click()

    await expect(page).toHaveURL('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme)

    await page.goBack()

    await expect(page).toHaveURL(/\/docs\/$/)

    await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme)
  })
}

test('install tabs support keyboard selection and copy the selected command', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/')

  const tabs = page.getByRole('tablist', { name: 'Install Commitprompt' })

  await tabs.getByRole('tab', { exact: true, name: 'pnpm' }).focus()

  await page.keyboard.press('End')

  await expect(tabs.getByRole('tab', { name: 'Yarn' })).toBeFocused()

  await page.keyboard.press('Enter')

  await expect(tabs.getByRole('tab', { name: 'Yarn' })).toHaveAttribute('aria-selected', 'true')

  const panel = page.getByRole('tabpanel')

  await expect(panel).toContainText('yarn add --dev @santi020k/commitprompt')

  await panel.getByRole('button', { name: 'Copy code to clipboard' }).click()

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('yarn add --dev @santi020k/commitprompt')
})

test('documentation deep links update navigation and remain below the header', async ({ page }) => {
  await page.goto('/docs/#automation-ai')

  const navigation = page.getByRole('navigation', { exact: true, name: 'Documentation' })

  await expect.poll(async () => {
    const target = await page.locator('#automation-ai').boundingBox()

    return target !== null && target.y >= 111 && target.y <= 113
  }).toBe(true)

  await expect(navigation.getByRole('link', { name: 'Automation and AI' })).toHaveAttribute('aria-current', 'location')

  await navigation.getByRole('link', { name: 'Git hooks', exact: true }).click()

  await expect(page).toHaveURL(/#git-hooks$/)

  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute('aria-valuenow', /[1-9]\d*/)

  await expect.poll(async () => {
    const target = await page.locator('#git-hooks').boundingBox()
    const header = await page.locator('.site-header').boundingBox()

    return target !== null && header !== null && target.y >= header.y + header.height && target.y <= 113
  }).toBe(true)

  await expect(navigation.getByRole('link', { name: 'Git hooks', exact: true })).toHaveAttribute('aria-current', 'location')
})

test('reduced motion keeps the full homepage content available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  for (const section of await page.locator('main [data-ui-scroll-reveal]').all()) {
    await section.scrollIntoViewIfNeeded()

    await expect(section).toHaveCSS('opacity', '1')
  }

  await page.getByRole('banner').getByRole('link', { name: 'Commitprompt home' }).focus()

  await page.keyboard.press('Tab')

  await expect(page.locator(':focus')).toHaveCSS('outline-style', 'solid')
})

test('footer links navigate between the homepage and documentation', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('contentinfo').getByRole('link', { name: 'Read the docs' }).click()

  await expect(page).toHaveURL(/\/docs\/$/)

  await page.getByRole('contentinfo').getByRole('link', { name: 'Commitprompt home' }).click()

  await expect(page).toHaveURL('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
