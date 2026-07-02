/**
 * Авто-аудит качества учёта клиента (ИП) — вдохновение 1С:Мультибух.
 * Чистая функция: находит типовые проблемы, из-за которых бухгалтер потом
 * ловит ошибки в отчётности. Показывается в «Обзоре клиентов».
 */
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'
import type { Doc } from '../state/docsStore'
import type { Employee } from '../state/employeesStore'
import { getParams } from './taxcore'

export interface AuditIssue {
  level: 'error' | 'warn'
  text: string
}

export function auditClient(
  org: Org,
  ops: Operation[],
  docs: Doc[],
  employees: Employee[],
  today: Date = new Date()
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const err = (text: string) => issues.push({ level: 'error', text })
  const warn = (text: string) => issues.push({ level: 'warn', text })

  // 1. Реквизиты, без которых не собрать отчётность.
  if (!org.inn) err('Не указан ИНН — без него не сформировать ни один отчёт.')
  if (!org.oktmo) err('Не указан ОКТМО — обязателен в уведомлениях ЕНС и декларации.')
  if (!org.taxOfficeCode) warn('Не указан код налоговой (ИФНС) — попадёт «0000» в файлы отчётности.')
  if (!org.fio) warn('Не указано ФИО предпринимателя — печатные формы будут с пропусками.')
  if (!org.regDate) warn('Не указана дата регистрации ИП — взносы за неполный год посчитаются как за полный.')
  if (!org.bankAccount || !org.bik) warn('Не заполнен расчётный счёт/БИК — счета и платёжки будут без реквизитов.')

  // 2. Операции: пустой текущий квартал при активном годе.
  const yearOps = ops.filter((o) => o.date.startsWith(String(org.year)))
  if (today.getFullYear() === org.year) {
    const q = Math.floor(today.getMonth() / 3)
    const qOps = yearOps.filter((o) => Math.floor((Number(o.date.slice(5, 7)) - 1) / 3) === q)
    if (yearOps.length > 0 && qOps.length === 0) {
      warn(`Нет операций за текущий квартал (${q + 1} кв.) — забыли загрузить выписку?`)
    }
  }

  // 3. Налоговые расходы без документа-основания (Д−Р: снимут при проверке).
  if (org.usnObject === 'income_minus') {
    const noDoc = yearOps.filter((o) => o.kind === 'expense' && o.taxable && !o.doc).length
    if (noDoc > 0) warn(`Расходов в налоге без документа-основания: ${noDoc} — при проверке ФНС их могут снять.`)
  }

  // 4. Сотрудники: несоответствие флага и данные для перссведений.
  if (org.hasEmployees && employees.length === 0) {
    warn('Стоит галочка «есть работники», но сотрудники не заведены — зарплатная отчётность будет пустой.')
  }
  if (!org.hasEmployees && employees.length > 0) {
    err('Сотрудники заведены, но флаг «есть наёмные работники» выключен — вычет УСН считается без ограничения 50%.')
  }
  const noSnils = employees.filter((e) => !e.snils).length
  if (employees.length > 0 && noSnils > 0) {
    err(`Сотрудников без СНИЛС: ${noSnils} — перссведения (КНД 1151162) не примут.`)
  }
  const noInnEmp = employees.filter((e) => !e.inn).length
  if (employees.length > 0 && noInnEmp > 0) {
    warn(`Сотрудников без ИНН: ${noInnEmp} — строка 020 перссведений останется пустой.`)
  }

  // 5. НДС: доход выше порога освобождения при выключенном флаге.
  try {
    const p = getParams(org.year)
    const income = yearOps.length
      ? yearOps.filter((o) => o.kind === 'income' && o.taxable).reduce((s, o) => s + o.amount, 0)
      : org.income
    const vatLimit = p.vat_exempt_threshold.toNumber()
    if (!org.vat && income > vatLimit) {
      err(`Доход выше порога НДС-освобождения (${Math.round(vatLimit / 1e6)} млн), а флаг «плательщик НДС» выключен.`)
    }
  } catch {
    /* нет параметров года */
  }

  // 6. Разрывы нумерации исходящих счетов (числовые номера).
  const nums = docs
    .filter((d) => d.type === 'invoice' && d.direction === 'outgoing' && d.date.startsWith(String(org.year)))
    .map((d) => Number(d.number))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  const missing: number[] = []
  for (let i = 1; i < nums.length; i++) {
    for (let n = nums[i - 1] + 1; n < nums[i] && missing.length < 5; n++) missing.push(n)
  }
  if (missing.length > 0) {
    warn(`Разрыв нумерации счетов: пропущены № ${missing.join(', ')}${missing.length >= 5 ? '…' : ''}.`)
  }

  // 7. Неоплаченные исходящие счета старше 30 дней (дебиторка зависла).
  const t = today.getTime()
  const overdueInvoices = docs.filter(
    (d) =>
      d.type === 'invoice' &&
      d.direction === 'outgoing' &&
      d.paymentStatus !== 'paid' &&
      t - Date.parse(d.date) > 30 * 86_400_000
  ).length
  if (overdueInvoices > 0) warn(`Неоплаченных счетов старше 30 дней: ${overdueInvoices} — стоит напомнить клиентам.`)

  return issues
}
