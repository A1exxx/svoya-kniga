import { defineConfig, devices } from '@playwright/test'

/**
 * E2E-конфиг (Playwright). Запуск:
 *   npm i -D @playwright/test && npx playwright install chromium
 *   npm run test:e2e
 * Поднимает dev-сервер на 5180 и гоняет сценарии из ./e2e.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
