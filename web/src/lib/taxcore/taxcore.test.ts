/**
 * Тесты taxcore TypeScript — эталонные значения 1-в-1 из Python-тестов.
 *
 * Запуск: npx vitest run src/lib/taxcore/taxcore.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import Decimal from 'decimal.js';

import {
  calcContributions,
  calcUsn,
  usnQuick,
  usnCalendar,
  getParams,
} from './index.js';

// ---------------------------------------------------------------------------
// Вспомогательная функция: сравниваем Decimal с числом без потерь
// ---------------------------------------------------------------------------
function eq(d: Decimal, n: number | string): boolean {
  return d.eq(new Decimal(String(n)));
}

// ---------------------------------------------------------------------------
// vznosy — страховые взносы
// ---------------------------------------------------------------------------

describe('calcContributions', () => {
  it('2025 income 1_000_000 → fixed 53658, one_percent 7000, total 60658, capped false', () => {
    const r = calcContributions(2025, 1_000_000);
    expect(eq(r.fixed, 53658)).toBe(true);
    expect(eq(r.income_over_threshold, 700_000)).toBe(true);
    expect(eq(r.one_percent, 7000)).toBe(true);
    expect(eq(r.total, 60658)).toBe(true);
    expect(r.capped).toBe(false);
  });

  it('2025 income 200_000 → one_percent 0, total 53658', () => {
    const r = calcContributions(2025, 200_000);
    expect(eq(r.fixed, 53658)).toBe(true);
    expect(eq(r.one_percent, 0)).toBe(true);
    expect(eq(r.total, 53658)).toBe(true);
    expect(r.capped).toBe(false);
  });

  it('2025 income 50_000_000 → capped true, one_percent 300888, total 354546', () => {
    const r = calcContributions(2025, 50_000_000);
    expect(r.capped).toBe(true);
    expect(eq(r.one_percent, 300_888)).toBe(true);
    expect(eq(r.total, 354_546)).toBe(true); // 53658 + 300888
  });

  it('2025 income_minus income 2_000_000 expenses 1_500_000 → base_1pct 500000, income_over 200000, one_percent 2000, total 55658', () => {
    const r = calcContributions(2025, 2_000_000, 1_500_000, 'income_minus');
    expect(eq(r.base_1pct, 500_000)).toBe(true);
    expect(eq(r.income_over_threshold, 200_000)).toBe(true);
    expect(eq(r.one_percent, 2000)).toBe(true);
    expect(eq(r.total, 55_658)).toBe(true);
  });

  it('2024 income 1_000_000 → fixed 49500, one_percent 7000', () => {
    const r = calcContributions(2024, 1_000_000);
    expect(eq(r.fixed, 49500)).toBe(true);
    expect(eq(r.one_percent, 7000)).toBe(true);
  });

  it('сроки уплаты — рабочие дни', () => {
    const r = calcContributions(2025, 1_000_000);
    const fixedDate = new Date(r.fixed_due);
    const onePctDate = new Date(r.one_percent_due);
    // getDay(): 0=вс, 6=сб
    expect(fixedDate.getUTCDay()).not.toBe(0);
    expect(fixedDate.getUTCDay()).not.toBe(6);
    expect(onePctDate.getUTCDay()).not.toBe(0);
    expect(onePctDate.getUTCDay()).not.toBe(6);
    // Год и месяц
    expect(fixedDate.getUTCFullYear()).toBe(2025);
    expect(fixedDate.getUTCMonth() + 1).toBe(12);
    expect(onePctDate.getUTCFullYear()).toBe(2026);
    expect(onePctDate.getUTCMonth() + 1).toBe(7);
  });

  it('2026 verified=true (ФЗ № 176-ФЗ подтверждён)', () => {
    expect(getParams(2026).verified).toBe(true);
    // fixed 57390, max_variable 321818
    const p = getParams(2026);
    expect(p.fixed_contributions.eq(new Decimal('57390'))).toBe(true);
    expect(p.max_variable_contributions.eq(new Decimal('321818'))).toBe(true);
  });

  it('неизвестный год бросает ошибку', () => {
    expect(() => calcContributions(2010, 1_000_000)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// usn — расчёт УСН
// ---------------------------------------------------------------------------

describe('usnQuick — УСН Доходы', () => {
  it('income 1_000_000, contrib 60658 без работников → tax_before 60000, final 0, due 0', () => {
    const r = usnQuick(2025, 'income', 1_000_000, { contributionsToDeduct: 60_658 });
    expect(eq(r.periods[0].tax_before_deduction_cumulative, 60_000)).toBe(true);
    expect(eq(r.tax_year_final, 0)).toBe(true);
    expect(eq(r.year_payment_due, 0)).toBe(true);
  });

  it('income 3_000_000, contrib 60658 → tax_before 180000, deduction 60658, final 119342', () => {
    const r = usnQuick(2025, 'income', 3_000_000, { contributionsToDeduct: 60_658 });
    expect(eq(r.periods[0].tax_before_deduction_cumulative, 180_000)).toBe(true);
    expect(eq(r.periods[0].deduction_cumulative, 60_658)).toBe(true);
    expect(eq(r.tax_year_final, 119_342)).toBe(true);
  });

  it('income 1_000_000, contrib 100000, hasEmployees true → deduction 30000, final 30000', () => {
    const r = usnQuick(2025, 'income', 1_000_000, {
      contributionsToDeduct: 100_000,
      hasEmployees: true,
    });
    // 50% от 60000 = 30000 (не 100000)
    expect(eq(r.periods[0].deduction_cumulative, 30_000)).toBe(true);
    expect(eq(r.tax_year_final, 30_000)).toBe(true);
  });

  it('региональная ставка 1% → tax_before 10000', () => {
    const r = usnQuick(2025, 'income', 1_000_000, { rate: '0.01' });
    expect(eq(r.rate, '0.01')).toBe(true);
    expect(eq(r.periods[0].tax_before_deduction_cumulative, 10_000)).toBe(true);
  });
});

describe('calcUsn — quarterly income cumulative', () => {
  it('4 периода по 300k дохода, взносы нарастающим итогом → авансы [4585,4585,4585,4587]', () => {
    const periods = [
      { label: '1 квартал', income_cumulative: 300_000, contributions_to_deduct_cumulative: 13_415 },
      { label: 'полугодие', income_cumulative: 600_000, contributions_to_deduct_cumulative: 26_830 },
      { label: '9 месяцев', income_cumulative: 900_000, contributions_to_deduct_cumulative: 40_245 },
      { label: 'год', income_cumulative: 1_200_000, contributions_to_deduct_cumulative: 53_658 },
    ];
    const r = calcUsn(2025, 'income', periods, false);
    const advances = r.periods.map((p) => p.advance_due_this_period);

    expect(eq(advances[0], 4585)).toBe(true);
    expect(eq(advances[1], 4585)).toBe(true);
    expect(eq(advances[2], 4585)).toBe(true);
    expect(eq(advances[3], 4587)).toBe(true);

    expect(eq(r.advances_paid_total, 13_755)).toBe(true);
    expect(eq(r.year_payment_due, 4_587)).toBe(true);
    expect(eq(r.tax_year_final, 18_342)).toBe(true);
    expect(eq(r.tax_year_computed, 18_342)).toBe(true);
  });
});

describe('usnQuick — УСН Доходы минус расходы', () => {
  it('income 2_000_000 expenses 1_000_000 → computed 150000, min_tax 20000, final 150000', () => {
    const r = usnQuick(2025, 'income_minus', 2_000_000, { expenses: 1_000_000 });
    expect(eq(r.tax_year_computed, 150_000)).toBe(true);
    expect(eq(r.min_tax, 20_000)).toBe(true);
    expect(eq(r.tax_year_final, 150_000)).toBe(true);
  });

  it('income 2_000_000 expenses 1_900_000 → computed 15000, min_tax 20000, final 20000, due 20000', () => {
    const r = usnQuick(2025, 'income_minus', 2_000_000, { expenses: 1_900_000 });
    expect(eq(r.tax_year_computed, 15_000)).toBe(true);
    expect(eq(r.min_tax, 20_000)).toBe(true);
    expect(eq(r.tax_year_final, 20_000)).toBe(true);
    expect(eq(r.year_payment_due, 20_000)).toBe(true);
  });
});

describe('calcUsn — quarterly income_minus with min_tax', () => {
  it('авансы с прибыли, по году сработал мин. налог', () => {
    const periods = [
      { label: '1 квартал', income_cumulative: 500_000, expenses_cumulative: 450_000 },
      { label: 'полугодие', income_cumulative: 1_000_000, expenses_cumulative: 950_000 },
      { label: '9 месяцев', income_cumulative: 1_500_000, expenses_cumulative: 1_450_000 },
      { label: 'год', income_cumulative: 2_000_000, expenses_cumulative: 1_980_000 },
    ];
    const r = calcUsn(2025, 'income_minus', periods);

    // Q1: (500000-450000)*15% = 7500
    expect(eq(r.periods[0].advance_due_this_period, 7_500)).toBe(true);
    expect(eq(r.min_tax, 20_000)).toBe(true);
    expect(eq(r.tax_year_final, 20_000)).toBe(true);
    expect(eq(r.advances_paid_total, 7_500)).toBe(true);
    // 20000 - 7500 = 12500
    expect(eq(r.year_payment_due, 12_500)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ens — налоговый календарь
// ---------------------------------------------------------------------------

describe('usnCalendar', () => {
  it('2025 → 10 событий, отсортированы по дате, все на буднях', () => {
    const events = usnCalendar(2025);
    expect(events.length).toBe(10);

    // Отсортированы
    for (let i = 1; i < events.length; i++) {
      expect(events[i].due >= events[i - 1].due).toBe(true);
    }

    // Все на рабочих днях (UTC)
    for (const e of events) {
      const d = new Date(e.due);
      const day = d.getUTCDay(); // 0=вс, 6=сб
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    }
  });

  it('содержит авансы Q1/полугодие/9мес, декларацию, взносы', () => {
    const titles = usnCalendar(2025).map((e) => e.title);
    expect(titles.some((t) => t.includes('Декларация'))).toBe(true);
    expect(titles.some((t) => t.includes('1 квартал'))).toBe(true);
    expect(titles.some((t) => t.includes('Фиксированные страховые взносы'))).toBe(true);
    expect(titles.some((t) => t.includes('1% с дохода свыше'))).toBe(true);
  });

  it('охватывает два года (taxYear и taxYear+1)', () => {
    const events = usnCalendar(2025);
    const years = new Set(events.map((e) => e.due.slice(0, 4)));
    expect(years.has('2025')).toBe(true);
    expect(years.has('2026')).toBe(true);
  });

  it('подставляет суммы из calcContributions и usnQuick', () => {
    const contr = calcContributions(2025, 1_000_000);
    const usn = usnQuick(2025, 'income', 1_000_000, { contributionsToDeduct: 60_658 });
    const events = usnCalendar(2025, usn, contr);

    const fixedEv = events.find((e) => e.title.includes('Фиксированные'));
    expect(fixedEv?.amount && eq(fixedEv.amount, 53658)).toBe(true);

    const onePctEv = events.find((e) => e.title.includes('1% с дохода'));
    expect(onePctEv?.amount && eq(onePctEv.amount, 7000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based тесты (fast-check)
// ---------------------------------------------------------------------------

describe('property tests', () => {
  it('one_percent всегда ≤ потолка для любого года и дохода', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(2024, 2025, 2026),
        fc.integer({ min: 0, max: 100_000_000 }),
        (year, income) => {
          const r = calcContributions(year, income);
          const cap = getParams(year).max_variable_contributions;
          return r.one_percent.lte(cap);
        }
      )
    );
  });

  it('one_percent ≥ 0 для любого дохода', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (income) => {
        const r = calcContributions(2025, income);
        return r.one_percent.gte(0);
      })
    );
  });

  it('total = fixed + one_percent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (income) => {
        const r = calcContributions(2025, income);
        return r.total.eq(r.fixed.plus(r.one_percent));
      })
    );
  });

  it('налог УСН income ≥ 0 при любом доходе и взносах', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 200_000 }),
        (income, contrib) => {
          const r = usnQuick(2025, 'income', income, { contributionsToDeduct: contrib });
          return r.tax_year_final.gte(0) && r.year_payment_due.gte(0);
        }
      )
    );
  });

  it('авансы каждого периода ≥ 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 200_000 }),
        (income, contrib) => {
          const r = usnQuick(2025, 'income', income, { contributionsToDeduct: contrib });
          return r.periods.every((p) => p.advance_due_this_period.gte(0));
        }
      )
    );
  });

  it('дробные взносы: usnQuick(2025, income, 1234567, contrib 63003.67) → taxYearFinal целое', () => {
    const r = usnQuick(2025, 'income', 1_234_567, { contributionsToDeduct: 63_003.67 });
    // roundRub гарантирует целое число рублей
    expect(r.tax_year_final.decimalPlaces()).toBe(0);
    expect(r.tax_year_final.eq(r.tax_year_final.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))).toBe(true);
  });

  it('для income_minus: tax_year_final ≥ min_tax', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (income, expenses) => {
          const r = usnQuick(2025, 'income_minus', income, { expenses });
          // По итогам года: final >= min_tax (это и есть смысл минимального налога)
          return r.tax_year_final.gte(r.min_tax);
        }
      )
    );
  });

  it('нарастающий итог tax_cumulative неубывающий по периодам', () => {
    fc.assert(
      fc.property(
        // 4 нарастающих значения дохода
        fc.tuple(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 1_000_000 })
        ),
        ([q1, q2, q3, q4]) => {
          // Сортируем, чтобы гарантировать нарастание
          const inc = [q1, q1 + q2, q1 + q2 + q3, q1 + q2 + q3 + q4];
          const periods = inc.map((v, i) => ({
            label: String(i),
            income_cumulative: v,
          }));
          const r = calcUsn(2025, 'income', periods, false);
          for (let i = 1; i < r.periods.length; i++) {
            if (!r.periods[i].tax_cumulative.gte(r.periods[i - 1].tax_cumulative)) {
              return false;
            }
          }
          return true;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Тесты фиксов (повторяют Python tests/test_fixes.py)
// ---------------------------------------------------------------------------

describe('fix: overpayment — взносы уплачены в конце года', () => {
  // Сценарий: ИП платил авансы без вычета (взносы не были уплачены в течение года),
  // а в декабре уплатил все взносы 53 658 ₽ разом.
  // Итог: авансы Q1+полугодие+9мес = 72 000 ₽, но годовой налог = 36 342 ₽ → переплата.
  const periods = [
    { label: '1 квартал',  income_cumulative:  400_000, contributions_to_deduct_cumulative:      0 },
    { label: 'полугодие',  income_cumulative:  800_000, contributions_to_deduct_cumulative:      0 },
    { label: '9 месяцев',  income_cumulative: 1_200_000, contributions_to_deduct_cumulative:     0 },
    { label: 'год',        income_cumulative: 1_500_000, contributions_to_deduct_cumulative: 53_658 },
  ];

  it('advancesPaidTotal = 72 000', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(eq(r.advances_paid_total, 72_000)).toBe(true);
  });

  it('yearPaymentDue = 0 (годовой платёж не нужен — всё перекрыто авансами)', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(eq(r.year_payment_due, 0)).toBe(true);
  });

  it('taxYearFinal = 36 342', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(eq(r.tax_year_final, 36_342)).toBe(true);
  });

  it('yearOverpayment = 35 658 (72 000 + 0 − 36 342)', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(eq(r.year_overpayment, 35_658)).toBe(true);
  });

  it('в notes есть упоминание ст. 78', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(r.notes.some((n) => n.includes('78'))).toBe(true);
  });

  it('overpayment_this_period последнего периода = 35 658', () => {
    const r = calcUsn(2025, 'income', periods, false);
    const last = r.periods[r.periods.length - 1];
    expect(eq(last.overpayment_this_period, 35_658)).toBe(true);
  });
});

describe('fix: монотонный — взносы равномерно нарастающим итогом', () => {
  // Взносы уплачиваются равномерно: переплаты не должно быть.
  const periods = [
    { label: '1 квартал', income_cumulative:  300_000, contributions_to_deduct_cumulative: 13_415 },
    { label: 'полугодие', income_cumulative:  600_000, contributions_to_deduct_cumulative: 26_830 },
    { label: '9 месяцев', income_cumulative:  900_000, contributions_to_deduct_cumulative: 40_245 },
    { label: 'год',       income_cumulative: 1_200_000, contributions_to_deduct_cumulative: 53_658 },
  ];

  it('yearOverpayment = 0', () => {
    const r = calcUsn(2025, 'income', periods, false);
    expect(eq(r.year_overpayment, 0)).toBe(true);
  });

  it('advancesPaidTotal + yearPaymentDue == taxYearFinal', () => {
    const r = calcUsn(2025, 'income', periods, false);
    const total = r.advances_paid_total.plus(r.year_payment_due);
    expect(total.eq(r.tax_year_final)).toBe(true);
  });
});

describe('fix: календарь — нет двойного счёта при usnQuick (1 период)', () => {
  it('события авансов за кварталы имеют amount = null', () => {
    const usn = usnQuick(2025, 'income', 1_000_000, { contributionsToDeduct: 0 });
    const events = usnCalendar(2025, usn);
    const q1PayEv = events.find((e) => e.title === 'Аванс по УСН за 1 квартал');
    expect(q1PayEv).toBeDefined();
    expect(q1PayEv!.amount).toBeNull();
  });

  it('сумма payment-событий с "УСН" == taxYearFinal (60 000)', () => {
    const usn = usnQuick(2025, 'income', 1_000_000, { contributionsToDeduct: 0 });
    const events = usnCalendar(2025, usn);
    // Только payment-события с "УСН" в заголовке и ненулевой суммой
    const usnPayments = events.filter(
      (e) => e.kind === 'payment' && e.title.includes('УСН') && e.amount != null
    );
    const total = usnPayments.reduce((s, e) => s.plus(e.amount!), new Decimal('0'));
    expect(eq(total, 60_000)).toBe(true);
    expect(eq(usn.tax_year_final, 60_000)).toBe(true);
  });
});

describe('fix: отрицательные взносы → игнорируются (clamp через max(0, min(...)))', () => {
  it('contrib -50000 → taxYearFinal = 60 000 (как без взносов)', () => {
    // toDecimal(-50000) = -50000; max(0, min(-50000, 60000)) = 0 → вычет = 0
    const r = usnQuick(2025, 'income', 1_000_000, { contributionsToDeduct: -50_000 });
    expect(eq(r.tax_year_final, 60_000)).toBe(true);
  });
});

describe('fix: отрицательный доход → taxYearFinal = 0', () => {
  it('income -500000 → taxYearFinal = 0', () => {
    const r = usnQuick(2025, 'income', -500_000);
    expect(eq(r.tax_year_final, 0)).toBe(true);
  });
});

describe('fix: 50% floor с работниками', () => {
  it('income 500017, contrib 10000000, hasEmployees → taxBefore 30001, deduction 15000', () => {
    // taxBefore = roundRub(500017 * 0.06) = roundRub(30001.02) = 30001
    // max_ded = floor(30001 * 0.5) = floor(15000.5) = 15000 (ROUND_DOWN)
    // applied = max(0, min(10000000, 15000)) = 15000
    const r = usnQuick(2025, 'income', 500_017, {
      contributionsToDeduct: 10_000_000,
      hasEmployees: true,
    });
    expect(eq(r.periods[0].tax_before_deduction_cumulative, 30_001)).toBe(true);
    expect(eq(r.periods[0].deduction_cumulative, 15_000)).toBe(true);
  });
});

describe('fix: toDecimal бросает ошибку на мусорные входы', () => {
  // Импортируем напрямую через ESM — используем динамический импорт в beforeAll
  let toDecimalFn: (v: unknown) => Decimal;

  beforeAll(async () => {
    const mod = await import('./money.js');
    toDecimalFn = mod.toDecimal as (v: unknown) => Decimal;
  });

  it('бросает на null', () => { expect(() => toDecimalFn(null)).toThrow(); });
  it('бросает на undefined', () => { expect(() => toDecimalFn(undefined)).toThrow(); });
  it('бросает на NaN', () => { expect(() => toDecimalFn(NaN)).toThrow(); });
  it('бросает на Infinity', () => { expect(() => toDecimalFn(Infinity)).toThrow(); });
  it('бросает на -Infinity', () => { expect(() => toDecimalFn(-Infinity)).toThrow(); });
  it('бросает на пустую строку', () => { expect(() => toDecimalFn('')).toThrow(); });
  it('бросает на true', () => { expect(() => toDecimalFn(true)).toThrow(); });
  it('бросает на false', () => { expect(() => toDecimalFn(false)).toThrow(); });
});

describe('fix: дробные взносы → taxYearFinal целое число', () => {
  it('usnQuick(2025, income, 1234567, contrib 63003.67) → taxYearFinal целое', () => {
    const r = usnQuick(2025, 'income', 1_234_567, { contributionsToDeduct: 63_003.67 });
    expect(r.tax_year_final.decimalPlaces()).toBe(0);
  });
});
