/**
 * Базовые денежные утилиты для расчётов.
 *
 * Деньги считаем через decimal.js, чтобы не было ошибок округления float.
 * Налог УСН исчисляется в полных рублях (ст. 52 НК РФ), взносы — с копейками.
 */

import Decimal from 'decimal.js';

// Настройка decimal.js — ROUND_HALF_UP по умолчанию для всех операций
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type DecimalLike = number | string | Decimal;

/**
 * Безопасное приведение к Decimal (через строку, чтобы не тащить погрешность float).
 *
 * Бросает Error на мусорные входы (null, undefined, '', NaN, Infinity/-Infinity, boolean) —
 * чтобы ошибка ввода не «протекла» молча в расчёт и не выдала неверную сумму налога.
 */
export function toDecimal(value: unknown): Decimal {
  // boolean проверяем ДО числовой проверки — typeof true === 'boolean', не 'number'
  if (typeof value === 'boolean') {
    throw new Error(`Ожидалось число, получено булево значение: ${value}`);
  }
  if (value === null || value === undefined) {
    throw new Error('Ожидалось число, получено null/undefined');
  }
  if (value instanceof Decimal) {
    if (!value.isFinite()) {
      throw new Error(`Денежная сумма должна быть конечной (не NaN/Inf): ${value}`);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      throw new Error('Ожидалось число, получена пустая строка');
    }
  }
  if (typeof value === 'number') {
    if (isNaN(value)) {
      throw new Error(`Ожидалось число, получено NaN`);
    }
    if (!isFinite(value)) {
      throw new Error(`Денежная сумма должна быть конечной (не Infinity): ${value}`);
    }
  }
  let d: Decimal;
  try {
    d = new Decimal(String(value as number | string));
  } catch {
    throw new Error(`Не удалось преобразовать в число: ${value}`);
  }
  if (!d.isFinite()) {
    throw new Error(`Денежная сумма должна быть конечной (не NaN/Inf): ${value}`);
  }
  return d;
}

/**
 * Округление до полного рубля (налог УСН — в полных рублях, ст. 52 НК РФ).
 */
export function roundRub(value: DecimalLike): Decimal {
  return toDecimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Деньги до копейки (страховые взносы уплачиваются с копейками).
 */
export function money(value: DecimalLike): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Нерабочие праздничные дни РФ (производственный календарь с официальными переносами).
 * Источники: Пост. Правительства № 1335 от 04.10.2024 (2025), № 1466 от 24.09.2025 (2026).
 * Сдвигают сроки уплаты/сдачи на ближайший рабочий день. Расширяемо по годам (редактируемо).
 */
export const HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2025: [
    '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07', '2025-01-08',
    '2025-02-24', '2025-03-10', '2025-05-01', '2025-05-02', '2025-05-08', '2025-05-09',
    '2025-06-12', '2025-06-13', '2025-11-03', '2025-11-04', '2025-12-31',
  ],
  2026: [
    '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
    '2026-01-09', '2026-02-23', '2026-03-09', '2026-05-01', '2026-05-11', '2026-06-12',
    '2026-11-04', '2026-12-31',
  ],
};

function holidaySet(year: number): Set<string> {
  return new Set(HOLIDAYS_BY_YEAR[year] ?? []);
}

/** Нерабочий день: выходной (Сб/Вс) ИЛИ праздник из производственного календаря. */
function isNonWorkday(d: Date, hol: Set<string>): boolean {
  return d.getDay() === 0 || d.getDay() === 6 || hol.has(dateToIso(d));
}

/**
 * Перенос срока с нерабочего дня (выходной/праздник) на ближайший рабочий ВПЕРЁД.
 * Учитывает производственный календарь (HOLIDAYS_BY_YEAR). При неизвестном годе —
 * только выходные (праздники добавить в таблицу).
 */
export function shiftToWorkday(date: Date): Date {
  const d = new Date(date);
  let hol = holidaySet(d.getFullYear());
  while (isNonWorkday(d, hol)) {
    d.setDate(d.getDate() + 1);
    hol = holidaySet(d.getFullYear()); // год мог смениться (31.12 → январь)
  }
  return d;
}

/**
 * Перенос на ближайший рабочий день НАЗАД (для «последнего рабочего дня года» —
 * напр. срок уведомления НДФЛ за 23–31 декабря).
 */
export function shiftToWorkdayBack(date: Date): Date {
  const d = new Date(date);
  let hol = holidaySet(d.getFullYear());
  while (isNonWorkday(d, hol)) {
    d.setDate(d.getDate() - 1);
    hol = holidaySet(d.getFullYear());
  }
  return d;
}

/**
 * Форматирование даты как 'YYYY-MM-DD' строки (аналог Python date.isoformat()).
 */
export function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Создать дату без смещения часового пояса (UTC, только дата).
 */
export function makeDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Норма рабочих дней по месяцам (5-дневная неделя) — официальный производственный
 * календарь РФ с учётом переносов. Индекс 0 = январь.
 * Сверено по consultant.ru / garant.ru / buh.1c (2025 и 2026, по 247 рабочих дней в году).
 */
export const WORKDAYS_BY_YEAR: Record<number, number[]> = {
  2025: [17, 20, 21, 22, 18, 19, 23, 21, 22, 23, 19, 22],
  2026: [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22],
};

/**
 * Норма рабочих дней в месяце (month: 1..12). Для известного года — из официальной таблицы,
 * иначе фолбэк: будние дни месяца минус праздники из HOLIDAYS_BY_YEAR (без субботних переносов).
 */
export function workdaysInMonth(year: number, month: number): number {
  const table = WORKDAYS_BY_YEAR[year];
  if (table && month >= 1 && month <= 12) return table[month - 1];
  const hol = holidaySet(year);
  const days = new Date(year, month, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    if (!isNonWorkday(new Date(year, month - 1, d), hol)) n++;
  }
  return n;
}
