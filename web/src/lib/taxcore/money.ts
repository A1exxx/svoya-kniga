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
 * Перенос срока с выходного (Сб/Вс) на ближайший рабочий день.
 *
 * ВНИМАНИЕ: государственные праздники здесь НЕ учитываются. Перенос из-за
 * праздников нужно проверять вручную/через производственный календарь.
 */
export function shiftToWorkday(date: Date): Date {
  const d = new Date(date);
  // 0 = воскресенье, 6 = суббота
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
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
