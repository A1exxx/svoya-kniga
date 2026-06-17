/**
 * Страховые взносы ИП «за себя»: фиксированная часть + 1% с дохода свыше 300 000 ₽.
 */

import Decimal from 'decimal.js';
import { money, toDecimal, shiftToWorkday, dateToIso, makeDate, type DecimalLike } from './money.js';
import { getParams, type UsnObject } from './params.js';

function toDateUTC(v?: string): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Фиксированные взносы пропорционально дням деятельности в году (неполный год, ст. 430 НК). */
function proratedFixed(
  year: number,
  fixedAnnual: Decimal,
  regDate?: string,
  closeDate?: string
): { amount: Decimal; prorated: boolean } {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31);
  const rd = toDateUTC(regDate);
  const cd = toDateUTC(closeDate);
  let activeStart = start;
  let activeEnd = end;
  if (rd && rd.getUTCFullYear() === year && rd.getTime() > start) activeStart = rd.getTime();
  if (cd && cd.getUTCFullYear() === year && cd.getTime() < end) activeEnd = cd.getTime();
  if (activeStart <= start && activeEnd >= end) return { amount: fixedAnnual, prorated: false };
  const monthly = fixedAnnual.div(12);
  const DAY = 86_400_000;
  let total = new Decimal(0);
  for (let m = 0; m < 12; m++) {
    const dim = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    const ms = Date.UTC(year, m, 1);
    const me = Date.UTC(year, m, dim);
    const s = Math.max(activeStart, ms);
    const e = Math.min(activeEnd, me);
    if (e >= s) {
      const activeDays = Math.round((e - s) / DAY) + 1;
      total = total.plus(monthly.times(activeDays).div(dim));
    }
  }
  return { amount: total, prorated: true };
}

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
  usnObject: UsnObject = 'income',
  opts: { regDate?: string; closeDate?: string } = {}
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

  const { amount: fixedAmount, prorated } = proratedFixed(
    year,
    p.fixed_contributions,
    opts.regDate,
    opts.closeDate
  );
  if (prorated) {
    notes.push(
      'Фиксированные взносы уменьшены пропорционально периоду деятельности (неполный год, ст. 430 НК РФ).'
    );
  }

  return {
    year,
    fixed: money(fixedAmount),
    base_1pct: money(base_1pct),
    income_over_threshold: money(over),
    one_percent_uncapped: one_pct_uncapped,
    one_percent: money(one_pct),
    capped,
    total: money(fixedAmount.plus(one_pct)),
    fixed_due: dateToIso(shiftToWorkday(makeDate(year, 12, 28))),
    one_percent_due: dateToIso(shiftToWorkday(makeDate(year + 1, 7, 1))),
    notes,
  };
}
