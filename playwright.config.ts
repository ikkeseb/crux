import { defineConfig, devices } from '@playwright/test'

// Screenshots are produced against the production build served by `vite preview`.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4319',
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A distinctive port + never reuse, so we never bind to another project's server.
    command: 'pnpm preview --port 4319 --strictPort',
    url: 'http://localhost:4319',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
