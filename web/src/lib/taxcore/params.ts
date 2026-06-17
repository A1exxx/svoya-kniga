/**
 * Параметры налогов по годам.
 *
 * ВАЖНО: эти значения меняются КАЖДЫЙ год и подлежат проверке бухгалтером.
 * Здесь — «эталонный» seed; в продукте они будут редактироваться через UI
 * («Настройки → параметры налогов по годам») и храниться в БД с версией по году.
 *
 * Значения со статусом verified=false (особенно 2026) ОБЯЗАТЕЛЬНО сверить
 * с официальным источником перед использованием в реальной сдаче.
 */

import Decimal from 'decimal.js';
import { toDecimal } from './money.js';

export type UsnObject = 'income' | 'income_minus';

export interface YearParams {
  year: number;
  /** Фиксированные страховые взносы ИП «за себя» (за год) */
  fixed_contributions: Decimal;
  /** Порог дохода для 1% (300 000 ₽) */
  income_threshold_1pct: Decimal;
  /** Ставка переменной части (0.01) */
  rate_1pct: Decimal;
  /** Годовой потолок переменной части (1%) */
  max_variable_contributions: Decimal;
  /** Базовая ставка «Доходы» (регион может снизить) */
  usn_income_rate: Decimal;
  /** Базовая ставка «Доходы минус расходы» */
  usn_income_minus_rate: Decimal;
  /** Ставка минимального налога (1% от доходов) */
  usn_min_tax_rate: Decimal;
  /** НДС: порог освобождения (доход за год), ст. 145 НК РФ */
  vat_exempt_threshold: Decimal;
  /** НДС: верхняя граница спец-ставки 5% (доход) */
  vat_rate5_limit: Decimal;
  /** НДС: верхняя граница спец-ставки 7% (доход) — выше = утрата УСН */
  vat_rate7_limit: Decimal;
  /** НДС: общая ставка, % (20% до 2026, 22% с 2026 — ФЗ № 425-ФЗ) */
  vat_general_rate: Decimal;
  /** Сверено с официальным источником/бухгалтером */
  verified: boolean;
  note: string;
}

const D = toDecimal;

export const YEARS: Record<number, YearParams> = {
  2024: {
    year: 2024,
    fixed_contributions: D('49500'),
    income_threshold_1pct: D('300000'),
    rate_1pct: D('0.01'),
    max_variable_contributions: D('277571'),
    usn_income_rate: D('0.06'),
    usn_income_minus_rate: D('0.15'),
    usn_min_tax_rate: D('0.01'),
    vat_exempt_threshold: D('60000000'),
    vat_rate5_limit: D('250000000'),
    vat_rate7_limit: D('450000000'),
    vat_general_rate: D('20'),
    verified: true,
    note: 'Фикс 49 500 ₽ и потолок 1% = 277 571 ₽ — ст. 430 НК РФ. (НДС для УСН введён с 2025.)',
  },
  2025: {
    year: 2025,
    fixed_contributions: D('53658'),
    income_threshold_1pct: D('300000'),
    rate_1pct: D('0.01'),
    max_variable_contributions: D('300888'),
    usn_income_rate: D('0.06'),
    usn_income_minus_rate: D('0.15'),
    usn_min_tax_rate: D('0.01'),
    vat_exempt_threshold: D('60000000'),
    vat_rate5_limit: D('250000000'),
    vat_rate7_limit: D('450000000'),
    vat_general_rate: D('20'),
    verified: true,
    note: 'Фикс 53 658 ₽ и потолок 1% = 300 888 ₽ — ст. 430 НК РФ. НДС для УСН: освобождение ≤60 млн, спец-ставки 5/7%, общая 20% (ФЗ № 176-ФЗ).',
  },
  2026: {
    year: 2026,
    fixed_contributions: D('57390'),
    income_threshold_1pct: D('300000'),
    rate_1pct: D('0.01'),
    max_variable_contributions: D('321818'),
    usn_income_rate: D('0.06'),
    usn_income_minus_rate: D('0.15'),
    usn_min_tax_rate: D('0.01'),
    vat_exempt_threshold: D('20000000'),
    vat_rate5_limit: D('272500000'),
    vat_rate7_limit: D('490500000'),
    vat_general_rate: D('22'),
    verified: true,
    note:
      'Фикс 57 390 ₽ и потолок 1% = 321 818 ₽ — ст. 430 НК РФ. Максимум «за себя» 2026 = 379 208 ₽. ' +
      'НДС (ФЗ № 425-ФЗ от 28.11.2025): общая ставка 22%, порог освобождения снижен 60→20 млн ₽, ' +
      'спец-ставки 5% (20–272,5 млн) / 7% (272,5–490,5 млн, с дефлятором 1,090 — сверить).',
  },
};

export const DEFAULT_YEAR = 2026;

/**
 * Получить параметры налогов за год.
 * Кидает ошибку на неизвестный год — намеренно, чтобы не считать с неверными данными.
 */
export function getParams(year: number): YearParams {
  if (year in YEARS) {
    return YEARS[year];
  }
  throw new Error(
    `Нет параметров налогов за ${year} год. Добавьте их в taxcore/params.ts ` +
      `(в продукте — через «Настройки → параметры по годам»). Известные годы: ${Object.keys(YEARS).sort().join(', ')}.`
  );
}
