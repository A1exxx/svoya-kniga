/**
 * Страховые взносы ИП «за себя»: фиксированная часть + 1% с дохода свыше 300 000 ₽.
 */

import Decimal from 'decimal.js';
import { money, toDecimal, shiftToWorkday, dateToIso, makeDate, type DecimalLike } from './money.js';
import { getParams, type UsnObject } from './params.js';

export interface ContributionsResult {
  year: number;
  /** Фиксированная часть */
  fixed: Decimal;
  /** База для 1% (доход или доходы−расходы) */
  base_1pct: Decimal;
  /** Сумма свыше 300 000 ₽, с которой берётся 1% */
  income_over_threshold: Decimal;
  /** 1% до применения годового потолка */
  one_percent_uncapped: Decimal;
  /** 1% с учётом потолка */
  one_percent: Decimal;
  /** Достигнут ли потолок переменной части */
  capped: boolean;
  /** Фикс + 1% */
  total: Decimal;
  /** Срок уплаты фиксированной части (YYYY-MM-DD) */
  fixed_due: string;
  /** Срок уплаты 1% (YYYY-MM-DD) */
  one_percent_due: string;
  notes: string[];
}

/**
 * Взносы ИП «за себя» за год.
 *
 * База для 1%:
 *   • «Доходы»               → весь доход;
 *   • «Доходы минус расходы» → доходы − расходы (позиция в пользу налогоплательщика,
 *     подтверждена практикой КС РФ/письмами ФНС — но СВЕРИТЬ с бухгалтером).
 *
 * Сроки: фиксированная часть — до 28 декабря года; 1% — до 1 июля следующего года
 * (с переносом с выходного; праздники проверять отдельно).
 */
export function calcContributions(
  year: number,
  income: DecimalLike,
  expenses?: DecimalLike,
  usnObject: UsnObject = 'income'
): ContributionsResult {
  const p = getParams(year);
  const inc = toDecimal(income);
  const notes: string[] = [];

  let base_1pct: Decimal;
  if (usnObject === 'income_minus') {
    const exp = toDecimal(expenses ?? 0);
    base_1pct = inc.minus(exp);
    notes.push(
      'База 1% взята как доходы − расходы. Исторически спорно — сверить с бухгалтером.'
    );
  } else {
    base_1pct = inc;
  }

  let over = base_1pct.minus(p.income_threshold_1pct);
  if (over.lt(0)) {
    over = toDecimal(0);
  }

  const one_pct_uncapped = money(over.times(p.rate_1pct));
  const capped = one_pct_uncapped.gt(p.max_variable_contributions);
  const one_pct = capped ? p.max_variable_contributions : one_pct_uncapped;

  if (capped) {
    notes.push(
      `Применён годовой потолок переменной части: ${money(p.max_variable_contributions)} ₽.`
    );
  }
  if (!p.verified) {
    notes.push(
      `Параметры ${year} года не сверены (verified=false) — ОБЯЗАТЕЛЬНО проверить.`
    );
  }

  return {
    year,
    fixed: money(p.fixed_contributions),
    base_1pct: money(base_1pct),
    income_over_threshold: money(over),
    one_percent_uncapped: one_pct_uncapped,
    one_percent: money(one_pct),
    capped,
    total: money(p.fixed_contributions.plus(one_pct)),
    fixed_due: dateToIso(shiftToWorkday(makeDate(year, 12, 28))),
    one_percent_due: dateToIso(shiftToWorkday(makeDate(year + 1, 7, 1))),
    notes,
  };
}
