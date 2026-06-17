/**
 * Патентная система налогообложения (ПСН) для ИП.
 * Зеркало backend/taxcore/patent.py — значения совпадают 1-в-1.
 *
 * Стоимость = ПВГД × 6% × срок/12, минус взносы (с 2021: без работников до 100%,
 * с работниками — не более 50%, ст. 346.51 НК РФ). ПВГД задаётся региональным
 * законом — вводится пользователем.
 */
import Decimal from 'decimal.js';
import { roundRub, toDecimal, type DecimalLike } from './money.js';

export const PATENT_RATE = new Decimal('0.06');

export interface PatentScheduleItem {
  label: string;
  amount: Decimal;
}

export interface PatentResult {
  potential_income: Decimal;
  months: number;
  rate: Decimal;
  base: Decimal;
  cost_before_deduction: Decimal;
  deduction: Decimal;
  cost: Decimal;
  schedule: PatentScheduleItem[];
  notes: string[];
}

export interface CalcPatentOptions {
  contributionsToDeduct?: DecimalLike;
  hasEmployees?: boolean;
}

export function calcPatent(
  year: number,
  potentialIncome: DecimalLike,
  months = 12,
  opts: CalcPatentOptions = {}
): PatentResult {
  const { contributionsToDeduct = 0, hasEmployees = false } = opts;
  if (months < 1 || months > 12) {
    throw new Error('Срок патента — от 1 до 12 месяцев');
  }
  const pi = toDecimal(potentialIncome);
  if (pi.lt(0)) {
    throw new Error('ПВГД не может быть отрицательным');
  }
  const deduct = toDecimal(contributionsToDeduct);
  if (deduct.lt(0)) {
    throw new Error('Взносы не могут быть отрицательными');
  }

  const base = pi.times(months).div(12);
  const costBefore = roundRub(base.times(PATENT_RATE));

  let applied: Decimal;
  if (hasEmployees) {
    const maxDed = costBefore.times('0.5').toDecimalPlaces(0, Decimal.ROUND_DOWN);
    applied = Decimal.max(new Decimal('0'), Decimal.min(deduct, maxDed));
  } else {
    applied = Decimal.max(new Decimal('0'), Decimal.min(deduct, costBefore));
  }

  let cost = costBefore.minus(applied);
  if (cost.lt(0)) cost = new Decimal('0');
  cost = roundRub(cost);

  let schedule: PatentScheduleItem[];
  if (months <= 6) {
    schedule = [{ label: 'Вся сумма — до конца срока патента', amount: cost }];
  } else {
    const first = roundRub(cost.div(3));
    schedule = [
      { label: '1/3 — в течение 90 дней с начала действия', amount: first },
      { label: '2/3 — до конца срока патента', amount: cost.minus(first) },
    ];
  }

  return {
    potential_income: roundRub(pi),
    months,
    rate: PATENT_RATE.times(100),
    base: roundRub(base),
    cost_before_deduction: costBefore,
    deduction: roundRub(applied),
    cost,
    schedule,
    notes:
      year < 2021
        ? ['До 2021 года уменьшение патента на страховые взносы не применялось — проверить.']
        : ['Стоимость патента уменьшается на страховые взносы (с 2021), как УСН «Доходы».'],
  };
}
