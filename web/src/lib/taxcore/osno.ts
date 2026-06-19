/**
 * ОСНО (общая система налогообложения) для ИП — базовый расчёт.
 *
 * ИП на ОСНО платит:
 *   • НДФЛ по прогрессивной шкале (13/15/18/20/22%) с налоговой базы
 *     «доходы − профессиональный вычет» (ст. 210, 221, 224 НК РФ);
 *   • НДС с реализации по общей ставке (20% до 2026, 22% с 2026), если нет
 *     освобождения по ст. 145 НК РФ (выручка ≤ 2 млн ₽ за 3 месяца).
 *
 * Профессиональный вычет (ст. 221 НК РФ): документально подтверждённые расходы
 * ИЛИ 20% от доходов, если расходы подтвердить нельзя. Берём более выгодный.
 *
 * ⚠️ Это упрощённая модель для оценки. Полный учёт ОСНО (КУДиР по приказу
 * 86н/БГ-3-04/430, авансовые платежи по НДФЛ, вычет входящего НДС по
 * счёт-фактурам, имущественные/социальные вычеты) — отдельный большой модуль.
 * Финальную корректность подтверждает бухгалтер.
 */

import Decimal from 'decimal.js';
import { toDecimal, type DecimalLike } from './money.js';
import { getParams } from './params.js';
import { ndflProgressive } from './payroll.js';

export interface OsnoResult {
  income: Decimal; // доходы за год
  expenses: Decimal; // документально подтверждённые расходы
  professional_deduction: Decimal; // применённый проф. вычет = max(расходы, 20%)
  used_20pct: boolean; // применён вычет 20% (расходы не подтверждены/невыгодны)
  ndfl_base: Decimal; // налоговая база НДФЛ (доходы − вычет, не ниже 0)
  ndfl: Decimal; // НДФЛ по прогрессивной шкале, ₽
  vat_rate: Decimal; // общая ставка НДС, %
  vat_exempt: boolean; // освобождение от НДС (ст. 145)
  vat: Decimal; // НДС с реализации (в т.ч. в выручке), оценка
  total: Decimal; // НДФЛ + НДС
}

export interface OsnoOptions {
  /** Освобождение от НДС по ст. 145 НК РФ (выручка ≤ 2 млн ₽ за 3 мес.). */
  vatExempt?: boolean;
}

/** Базовый расчёт налогов ИП на ОСНО за год. */
export function calcOsnoIp(
  year: number,
  income: DecimalLike,
  expenses: DecimalLike = 0,
  opts: OsnoOptions = {}
): OsnoResult {
  const inc = toDecimal(income);
  const exp = toDecimal(expenses);
  if (inc.lt(0) || exp.lt(0)) {
    throw new Error('Доходы и расходы не могут быть отрицательными');
  }

  // Профессиональный вычет: документальные расходы или 20% от доходов — что больше.
  const ded20 = inc.times('0.20');
  const used_20pct = exp.lt(ded20);
  const professional_deduction = used_20pct ? ded20 : exp;

  const ndfl_base = Decimal.max(inc.minus(professional_deduction), new Decimal(0));
  const ndfl = ndflProgressive(ndfl_base);

  const vat_rate = getParams(year).vat_general_rate;
  const vat_exempt = !!opts.vatExempt;
  // НДС в т.ч. в выручке: inc − inc/(1+ставка/100). Без вычета входящего НДС (оценка).
  const vat = vat_exempt
    ? new Decimal(0)
    : inc
        .minus(inc.div(new Decimal(1).plus(vat_rate.div(100))))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const total = ndfl.plus(vat);

  return {
    income: inc,
    expenses: exp,
    professional_deduction,
    used_20pct,
    ndfl_base,
    ndfl,
    vat_rate,
    vat_exempt,
    vat,
    total,
  };
}
