import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  // One long simulated learner: the days run in order inside one test.
  fullyParallel: false,
  workers: 1,
  timeout: 40 * 60 * 1000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}/dansk-daily/`,
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    timezoneId: 'Europe/Copenhagen',
    // The app honours reduced motion; no sheet animations to wait for.
    reducedMotion: 'reduce',
    // The PWA service worker would serve cached pages between reloads; the test wants the plain build.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/dansk-daily/`,
    reuseExistingServer: false,
    timeout: 240 * 1000,
  },
})
