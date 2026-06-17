import { test, expect, type Page } from '@playwright/test'

/**
 * E2E-смоук ключевых сценариев бухгалтера. HashRouter → навигация через #/.
 * Перед каждым тестом чистим localStorage, чтобы стартовать с демо-ИП.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
})

const go = (page: Page, hash: string) => page.goto('/#' + hash)

test('дашборд загружается, видны разделы меню', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Задачи и отчётность' })).toBeVisible()
  for (const item of ['Налоги', 'Документы', 'Сотрудники', 'Налоговая', 'Полезные документы', 'Администрирование']) {
    await expect(page.getByRole('link', { name: item })).toBeVisible()
  }
})

test('реквизиты: заполнение ИНН и ОКТМО, валидация', async ({ page }) => {
  await go(page, '/requisites')
  await expect(page.getByRole('heading', { name: 'Реквизиты' })).toBeVisible()
  await page.getByPlaceholder('123456789012').fill('500100732250') // неверная контрольная
  await expect(page.getByText(/неверн/i)).toBeVisible()
})

test('сотрудники: добавление и вкладка «Сводка по штату»', async ({ page }) => {
  await go(page, '/employees')
  await page.getByRole('button', { name: 'Добавить' }).first().click()
  await page.getByRole('button', { name: 'Сводка по штату' }).click()
  await expect(page.getByText(/ФОТ за год/i)).toBeVisible()
})

test('документы: переключатель Исходящие/Входящие и создание счёта', async ({ page }) => {
  await go(page, '/documents')
  await page.getByRole('button', { name: 'Счёт' }).first().click()
  await expect(page.getByText(/Позиции/)).toBeVisible()
  await page.getByRole('button', { name: 'Входящие' }).click()
  await expect(page.getByText(/Входящие — счета и акты/)).toBeVisible()
})

test('администрирование: снимок попадает в журнал', async ({ page }) => {
  await go(page, '/admin')
  await page.getByRole('button', { name: 'Создать контрольную точку' }).click()
  await expect(page.getByText('Снимок создан')).toBeVisible()
})

test('тёмная тема переключается', async ({ page }) => {
  await page.getByRole('button', { name: 'Тьма' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
})
