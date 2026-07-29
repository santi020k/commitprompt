import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4322'

export default defineConfig({
  expect: {
    timeout: 5_000
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: 'tests',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'astro preview --host 127.0.0.1 --port 4322',
    reuseExistingServer: false,
    timeout: 30_000,
    url: baseURL
  },
  workers: process.env.CI ? 2 : undefined
})
