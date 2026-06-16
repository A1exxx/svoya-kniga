/**
 * Калькулятор УСН: «Доходы» (6%) и «Доходы минус расходы» (15%).
 *
 * Считает налог нарастающим итогом по отчётным периодам (1 кв., полугодие, 9 мес., год),
 * авансовые платежи к уплате за каждый период, минимальный налог (для «доходы−расходы»)
 * и доплату за год.
 *
 * Нюансы (помечаются в notes):
 *   • «Доходы»: налог уменьшается на страховые взносы. ИП без работников — до 100%
 *     (вплоть до 0); ИП с работниками — не более 50%. С 2023 фикс. взносы можно учитывать
 *     в периоде, на который они приходятся по сроку, даже если ещё не уплачены — здесь мы
 *     принимаем уже подготовленную сумму взносов к вычету (caller считает её сам).
 *   • «Доходы минус расходы»: взносы НЕ уменьшают налог напрямую — они входят в расходы.
 *     По итогам года платится не меньше минимального налога (1% от доходов).
 *   • Региональные пониженные ставки и торговый сбор (Москва) — передаются параметром/не
 *     учитываются; проверить отдельно.
 */

import Decimal from 'decimal.js';
import { roundRub, toDecimal, type DecimalLike } from './money.js';
import { getParams, type UsnObject } from './params.js';

/** Входные данные нарастающим итогом на конец отчётного периода. */
export interface PeriodData {
  /** «1 квартал» / «полугодие» / «9 месяцев» / «год» */
  label: string;
  /** Доходы нарастающим итогом */
  income_cumulative: DecimalLike;
  /** Расходы нарастающим итогом (для «доходы−расходы») */
  expenses_cumulative?: DecimalLike;
  /** Взносы к вычету (для «доходы»), нарастающим итогом */
  contributions_to_deduct_cumulative?: DecimalLike;
}

export interface PeriodResult {
  label: string;
  /** Налоговая база нарастающим итогом */
  tax_base_cumulative: Decimal;
  /** Налог до вычета взносов */
  tax_before_deduction_cumulative: Decimal;
  /** Принятые к вычету взносы (для «доходы») */
  deduction_cumulative: Decimal;
  /** Налог нарастающим итогом (с учётом вычета/мин. налога) */
  tax_cumulative: Decimal;
  /** К уплате за этот период (за вычетом ранее начисленного; ≥ 0) */
  advance_due_this_period: Decimal;
  /** «К уменьшению» за период, если налог просел ниже ранее начисленных авансов (≥ 0) */
  overpayment_this_period: Decimal;
  notes: string[];
}

export interface UsnYearResult {
  usn_object: UsnObject;
  rate: Decimal;
  periods: PeriodResult[];
  /** Расчётный налог за год (до сравнения с минимальным) */
  tax_year_computed: Decimal;
  /** Минимальный налог (только для «доходы−расходы», иначе 0) */
  min_tax: Decimal;
  /** Итоговый налог за год */
  tax_year_final: Decimal;
  /** Сумма авансов, начисленных за периоды до годового (Q1+полугодие+9мес) */
  advances_paid_total: Decimal;
  /** К доплате за год (≥ 0) */
  year_payment_due: Decimal;
  /** Переплата по итогам года (≥ 0) — к зачёту/возврату (ст. 78 НК РФ) */
  year_overpayment: Decimal;
  notes: string[];
}

/**
 * Полный расчёт УСН по отчётным периодам нарастающим итогом.
 *
 * @param year - налоговый год
 * @param usnObject - объект налогообложения ('income' | 'income_minus')
 * @param periods - массив периодов (1–4), данные нарастающим итогом
 * @param hasEmployees - есть ли наёмные работники (влияет на лимит вычета взносов)
 * @param rate - региональная ставка (переопределяет базовую из params)
 */
export function calcUsn(
  year: number,
  usnObject: UsnObject,
  periods: PeriodData[],
  hasEmployees = false,
  rate?: DecimalLike
): UsnYearResult {
  if (periods.length === 0) {
    throw new Error('Передайте хотя бы один отчётный период (PeriodData).');
  }

  const p = getParams(year);
  const eff_rate =
    rate !== undefined
      ? toDecimal(rate)
      : usnObject === 'income'
        ? p.usn_income_rate
        : p.usn_income_minus_rate;

  if (eff_rate.lt(0)) {
    throw new Error(`Ставка не может быть отрицательной: ${eff_rate}`);
  }

  const notes: string[] = [];
  if (!p.verified) {
    notes.push(`Параметры ${year} года не сверены (verified=false) — проверить.`);
  }

  const n = periods.length;
  // clamp income_year ≥ 0 (отрицательный доход не имеет смысла для мин. налога)
  let income_year = toDecimal(periods[n - 1].income_cumulative);
  if (income_year.lt(0)) income_year = new Decimal('0');

  // Минимальный налог считается только для «доходы−расходы» и только по итогам года.
  const min_tax =
    usnObject === 'income_minus'
      ? roundRub(income_year.times(p.usn_min_tax_rate))
      : new Decimal('0');

  const results: PeriodResult[] = [];
  let prev_payments = new Decimal('0');

  for (let i = 0; i < n; i++) {
    const pd = periods[i];
    const is_last = i === n - 1;
    const income_cum = toDecimal(pd.income_cumulative);
    const period_notes: string[] = [];

    let base: Decimal;
    let tax_before: Decimal;
    let applied: Decimal;
    let tax_after: Decimal;

    if (usnObject === 'income') {
      base = income_cum;
      if (base.lt(0)) base = new Decimal('0');
      tax_before = roundRub(base.times(eff_rate));
      const ded_avail = toDecimal(pd.contributions_to_deduct_cumulative ?? 0);

      if (hasEmployees) {
        // Потолок 50% округляем ВНИЗ — «не более 50%» (нельзя превышать).
        const max_ded = tax_before.times('0.5').toDecimalPlaces(0, Decimal.ROUND_DOWN);
        applied = Decimal.max(new Decimal('0'), Decimal.min(ded_avail, max_ded));
        if (ded_avail.gt(max_ded) && ded_avail.gt(0)) {
          period_notes.push('Вычет ограничен 50% налога (есть работники).');
        }
      } else {
        // Без работников вычет до 100% — налог может быть уменьшен до нуля.
        applied = Decimal.max(new Decimal('0'), Decimal.min(ded_avail, tax_before));
      }
      tax_after = roundRub(tax_before.minus(applied));
      if (tax_after.lt(0)) tax_after = new Decimal('0');
    } else {
      // income_minus: взносы НЕ вычитаются из налога — они учтены в расходах.
      const exp_cum = toDecimal(pd.expenses_cumulative ?? 0);
      base = income_cum.minus(exp_cum);
      if (base.lt(0)) base = new Decimal('0');
      tax_before = roundRub(base.times(eff_rate));
      applied = new Decimal('0');
      tax_after = tax_before;
    }

    // Минимальный налог применяется ТОЛЬКО по итогам года (последний период).
    // В авансовых периодах сравнение с min_tax не делается.
    let tax_effective = tax_after;
    if (is_last && usnObject === 'income_minus' && min_tax.gt(tax_after)) {
      tax_effective = min_tax;
      period_notes.push(
        `Применён минимальный налог 1% = ${min_tax} ₽ (больше расчётного ${tax_after} ₽).`
      );
    }

    const raw = tax_effective.minus(prev_payments);
    let advance: Decimal;
    let overpayment_this_period: Decimal;
    if (raw.lt(0)) {
      // Налог нарастающим итогом просел ниже ранее начисленных авансов — переплата.
      advance = new Decimal('0');
      overpayment_this_period = raw.neg();
    } else {
      advance = raw;
      overpayment_this_period = new Decimal('0');
    }

    results.push({
      label: pd.label,
      tax_base_cumulative: roundRub(base),
      tax_before_deduction_cumulative: tax_before,
      deduction_cumulative: applied,
      tax_cumulative: tax_effective,
      advance_due_this_period: advance,
      overpayment_this_period,
      notes: period_notes,
    });

    prev_payments = prev_payments.plus(advance);
  }

  const last = results[results.length - 1];

  // tax_year_computed = расчётный налог до сравнения с мин. налогом (округлённый, ≥ 0)
  let tax_year_computed = roundRub(
    last.tax_before_deduction_cumulative.minus(last.deduction_cumulative)
  );
  if (tax_year_computed.lt(0)) tax_year_computed = new Decimal('0');

  // Авансы — сумма за все периоды кроме последнего (год)
  const advances_paid_total = results
    .slice(0, -1)
    .reduce((sum, r) => sum.plus(r.advance_due_this_period), new Decimal('0'));

  const tax_year_final = last.tax_cumulative;
  const year_payment_due = last.advance_due_this_period;

  // Переплата = начислено по графику (авансы + годовой платёж) минус фактический годовой налог.
  let year_overpayment = advances_paid_total.plus(year_payment_due).minus(tax_year_final);
  if (year_overpayment.lt(0)) year_overpayment = new Decimal('0');
  if (year_overpayment.gt(0)) {
    notes.push(
      `Переплата по авансам ${year_overpayment} ₽ — положительное сальдо ЕНС, ` +
        `можно зачесть/вернуть (ст. 78 НК РФ).`
    );
  }

  return {
    usn_object: usnObject,
    rate: eff_rate,
    periods: results,
    tax_year_computed,
    min_tax,
    tax_year_final,
    advances_paid_total,
    year_payment_due,
    year_overpayment,
    notes,
  };
}

/**
 * Упрощённый годовой расчёт (один период «год») — для простого экрана-калькулятора.
 */
export function usnQuick(
  year: number,
  usnObject: UsnObject,
  income: DecimalLike,
  options: {
    expenses?: DecimalLike;
    contributionsToDeduct?: DecimalLike;
    hasEmployees?: boolean;
    rate?: DecimalLike;
  } = {}
): UsnYearResult {
  const period: PeriodData = {
    label: 'год',
    income_cumulative: toDecimal(income),
    expenses_cumulative: toDecimal(options.expenses ?? 0),
    contributions_to_deduct_cumulative: toDecimal(options.contributionsToDeduct ?? 0),
  };
  return calcUsn(year, usnObject, [period], options.hasEmployees ?? false, options.rate);
}
