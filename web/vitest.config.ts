import { defineConfig } from 'vitest/config'

// Конфиг vitest (юнит/property-тесты). E2E (Playwright) в ./e2e исключаем.
// Тесты не рендерят React, поэтому плагин react здесь не нужен.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
