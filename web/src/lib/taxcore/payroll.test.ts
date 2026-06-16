/**
 * Тесты зарплатных калькуляторов. Эталонные значения из test_payroll.py (Python).
 * Результаты должны 1-в-1 совпадать с Python-движком.
 */

import { describe, expect, it } from 'vitest';
import {
  calcAlimony,
  calcSalary,
  calcSickLeave,
  calcVacation,
  childDeductionMonthly,
  getPayroll,
  ndflProgressive,
} from './payroll.js';

// ---------------------------------------------------------------------------
// НДФЛ прогрессия
// ---------------------------------------------------------------------------

describe('ndflProgressive', () => {
  it('2 000 000 → 260 000 (13%)', () => {
    expect(ndflProgressive(2_000_000).toNumber()).toBe(260_000);
  });

  it('2 400 000 → 312 000 (граница 1-й ступени)', () => {
    expect(ndflProgressive(2_400_000).toNumber()).toBe(312_000);
  });

  it('3 000 000 → 402 000 (312 000 + 600 000 × 15%)', () => {
    expect(ndflProgressive(3_000_000).toNumber()).toBe(402_000);
  });

  it('5 000 000 → 702 000 (граница 2-й ступени)', () => {
    expect(ndflProgressive(5_000_000).toNumber()).toBe(702_000);
  });

  it('6 000 000 → 882 000 (702 000 + 1 млн × 18%)', () => {
    expect(ndflProgressive(6_000_000).toNumber()).toBe(882_000);
  });

  it('0 → 0', () => {
    expect(ndflProgressive(0).toNumber()).toBe(0);
  });

  it('отрицательное → 0', () => {
    expect(ndflProgressive(-100).toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Детские вычеты
// ---------------------------------------------------------------------------

describe('childDeductionMonthly 2025', () => {
  it('1 ребёнок → 1 400', () => {
    expect(childDeductionMonthly(2025, 1).toNumber()).toBe(1_400);
  });

  it('2 ребёнка → 4 200 (1 400 + 2 800)', () => {
    expect(childDeductionMonthly(2025, 2).toNumber()).toBe(4_200);
  });

  it('3 ребёнка → 10 200 (+ 6 000)', () => {
    expect(childDeductionMonthly(2025, 3).toNumber()).toBe(10_200);
  });

  it('(1, инвалид 1) → 13 400 (1 400 + 12 000)', () => {
    expect(childDeductionMonthly(2025, 1, 1).toNumber()).toBe(13_400);
  });

  it('(2, одинокий) → 8 400 (4 200 × 2)', () => {
    expect(childDeductionMonthly(2025, 2, 0, true).toNumber()).toBe(8_400);
  });
});

// ---------------------------------------------------------------------------
// Зарплата
// ---------------------------------------------------------------------------

describe('calcSalary — базовый, МСП, без детей', () => {
  const r = calcSalary(2025, 100_000, { msp: true });

  it('месяц[0].gross == 100 000', () => {
    expect(r.months[0].gross.toNumber()).toBe(100_000);
  });

  it('месяц[0].ndfl == 13 000', () => {
    expect(r.months[0].ndfl.toNumber()).toBe(13_000);
  });

  it('месяц[0].net == 87 000', () => {
    expect(r.months[0].net.toNumber()).toBe(87_000);
  });

  it('месяц[0].vznosy == 20 049 (МСП: 1.5×МРОТ×30% + остаток×15%)', () => {
    expect(r.months[0].vznosy.toNumber()).toBe(20049);
  });

  it('месяц[0].travmatizm == 200 (0.2%)', () => {
    expect(r.months[0].travmatizm.toNumber()).toBe(200);
  });

  it('ndfl_year == 156 000 (13 000 × 12)', () => {
    expect(r.ndfl_year.toNumber()).toBe(156_000);
  });

  it('gross_year == 1 200 000', () => {
    expect(r.gross_year.toNumber()).toBe(1_200_000);
  });

  it('employer_cost_year == 1 442 988', () => {
    expect(r.employer_cost_year.toNumber()).toBe(1_442_988);
  });
});

describe('calcSalary — прогрессия пересекает порог 2.4 млн', () => {
  it('оклад 250 000, МСП: ndfl_year == 402 000', () => {
    const r = calcSalary(2025, 250_000, { msp: true });
    expect(r.ndfl_year.toNumber()).toBe(402_000);
  });
});

describe('calcSalary — детский вычет до лимита 450 000', () => {
  const r = calcSalary(2025, 50_000, { children: 1, msp: true });

  it('январь (месяц[0]): deduction_applied == 1 400', () => {
    expect(r.months[0].deduction_applied.toNumber()).toBe(1_400);
  });

  it('сентябрь (месяц[8]): deduction_applied == 1 400 (накопл. 450 000 = предел)', () => {
    expect(r.months[8].deduction_applied.toNumber()).toBe(1_400);
  });

  it('октябрь (месяц[9]): deduction_applied == 0 (накопл. 500 000 > 450 000)', () => {
    expect(r.months[9].deduction_applied.toNumber()).toBe(0);
  });

  it('ndfl_year == 76 362 ((600 000 − 12 600) × 13%)', () => {
    expect(r.ndfl_year.toNumber()).toBe(76_362);
  });
});

describe('calcSalary — не-МСП, полный тариф', () => {
  it('месяц[0].vznosy == 30 000 (30% от 100 000)', () => {
    const r = calcSalary(2025, 100_000, { msp: false });
    expect(r.months[0].vznosy.toNumber()).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// Отпускные
// ---------------------------------------------------------------------------

describe('calcVacation', () => {
  it('base 600 000, 14 дней: avg_daily == 1 706.48', () => {
    const r = calcVacation(2025, 600_000, 14);
    expect(r.avg_daily.toString()).toBe('1706.48');
  });

  it('base 600 000, 14 дней: gross == 23 890.78', () => {
    const r = calcVacation(2025, 600_000, 14);
    expect(r.gross.toString()).toBe('23890.78');
  });

  it('base 600 000, 14 дней: ndfl == 3 106', () => {
    const r = calcVacation(2025, 600_000, 14);
    expect(r.ndfl.toNumber()).toBe(3_106);
  });

  it('base 600 000, 14 дней: net == 20 784.78', () => {
    const r = calcVacation(2025, 600_000, 14);
    expect(r.net.toString()).toBe('20784.78');
  });

  it('очень низкая база → avg_daily == min_daily (пол по МРОТ)', () => {
    const r = calcVacation(2025, 100_000, 10);
    expect(r.avg_daily.toString()).toBe(r.min_daily.toString());
  });

  it('min_daily == 765.87 (22 440 ÷ 29.3)', () => {
    const r = calcVacation(2025, 100_000, 10);
    expect(r.min_daily.toString()).toBe('765.87');
  });
});

// ---------------------------------------------------------------------------
// Больничные
// ---------------------------------------------------------------------------

describe('calcSickLeave — базовый', () => {
  const r = calcSickLeave(2025, 600_000, 550_000, 6, 10, 3);

  it('stazh_coeff == 0.8 (стаж 5–8 лет)', () => {
    expect(r.stazh_coeff.toString()).toBe('0.8');
  });

  it('daily_benefit == 1 260.27', () => {
    expect(r.daily_benefit.toString()).toBe('1260.27');
  });

  it('total == 12 602.70', () => {
    expect(r.total.toNumber()).toBe(12602.7);
  });

  it('employer_part == 3 780.81 (3 дня)', () => {
    expect(r.employer_part.toString()).toBe('3780.81');
  });

  it('sfr_part == 8 821.89', () => {
    expect(r.sfr_part.toString()).toBe('8821.89');
  });
});

describe('calcSickLeave — максимальный потолок 2025', () => {
  const r = calcSickLeave(2025, 9_000_000, 9_000_000, 10, 1);

  it('max_daily == 5 673.97 ((2 225 000 + 1 917 000) ÷ 730)', () => {
    expect(r.max_daily.toString()).toBe('5673.97');
  });

  it('avg_daily_used == max_daily (заработок превышает базы)', () => {
    expect(r.avg_daily_used.toString()).toBe(r.max_daily.toString());
  });

  it('stazh_coeff == 1.0 (стаж ≥ 8 лет)', () => {
    expect(r.stazh_coeff.toNumber()).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Алименты
// ---------------------------------------------------------------------------

describe('calcAlimony', () => {
  it('1 ребёнок: base_after_ndfl == 87 000', () => {
    const r = calcAlimony(100_000, 13_000, 1);
    expect(r.base_after_ndfl.toNumber()).toBe(87_000);
  });

  it('1 ребёнок: share_label == "1/4"', () => {
    const r = calcAlimony(100_000, 13_000, 1);
    expect(r.share_label).toBe('1/4');
  });

  it('1 ребёнок: alimony == 21 750 (87 000 / 4)', () => {
    const r = calcAlimony(100_000, 13_000, 1);
    expect(r.alimony.toNumber()).toBe(21750);
  });

  it('1 ребёнок: capped == false', () => {
    const r = calcAlimony(100_000, 13_000, 1);
    expect(r.capped).toBe(false);
  });

  it('3 ребёнка: share_label == "1/2"', () => {
    const r = calcAlimony(100_000, 13_000, 3);
    expect(r.share_label).toBe('1/2');
  });

  it('3 ребёнка: alimony == 43 500 (87 000 / 2)', () => {
    const r = calcAlimony(100_000, 13_000, 3);
    expect(r.alimony.toNumber()).toBe(43500);
  });
});

// ---------------------------------------------------------------------------
// getPayroll — параметры
// ---------------------------------------------------------------------------

describe('getPayroll', () => {
  it('2025: mrot == 22 440', () => {
    expect(getPayroll(2025).mrot.toNumber()).toBe(22_440);
  });

  it('2026: mrot == 27 093', () => {
    expect(getPayroll(2026).mrot.toNumber()).toBe(27_093);
  });

  it('2025: vznosy_limit_base == 2 759 000', () => {
    expect(getPayroll(2025).vznosy_limit_base.toNumber()).toBe(2_759_000);
  });

  it('2026: vznosy_limit_base == 2 979 000', () => {
    expect(getPayroll(2026).vznosy_limit_base.toNumber()).toBe(2_979_000);
  });

  it('неизвестный год → Error', () => {
    expect(() => getPayroll(2010)).toThrow();
  });
});
