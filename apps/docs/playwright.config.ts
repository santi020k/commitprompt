import { defineConfig, devices } from '@playwright/test'

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
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4321',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: 'http://127.0.0.1:4321'
  },
  workers: process.env.CI ? 2 : undefined
})
