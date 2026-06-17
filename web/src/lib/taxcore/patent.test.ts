/** Тесты патента (ПСН) — паритет с test_patent.py. */
import { describe, expect, it } from 'vitest';
import { calcPatent } from './patent.js';

describe('calcPatent', () => {
  it('год, без вычета: 1.2М × 6% = 72 000', () => {
    const r = calcPatent(2026, 1_200_000, 12);
    expect(r.cost_before_deduction.toNumber()).toBe(72_000);
    expect(r.cost.toNumber()).toBe(72_000);
    expect(r.schedule.length).toBe(2);
  });

  it('полгода: база 600 000, стоимость 36 000, одна оплата', () => {
    const r = calcPatent(2026, 1_200_000, 6);
    expect(r.base.toNumber()).toBe(600_000);
    expect(r.cost.toNumber()).toBe(36_000);
    expect(r.schedule.length).toBe(1);
  });

  it('вычет взносов без работников: 72 000 − 50 000 = 22 000', () => {
    const r = calcPatent(2026, 1_200_000, 12, { contributionsToDeduct: 50_000 });
    expect(r.cost.toNumber()).toBe(22_000);
  });

  it('вычет с работниками ограничен 50%: к уплате 36 000', () => {
    const r = calcPatent(2026, 1_200_000, 12, {
      contributionsToDeduct: 50_000,
      hasEmployees: true,
    });
    expect(r.deduction.toNumber()).toBe(36_000);
    expect(r.cost.toNumber()).toBe(36_000);
  });

  it('график оплаты 1/3 + 2/3 = стоимость', () => {
    const r = calcPatent(2026, 1_200_000, 12);
    expect(r.schedule[0].amount.toNumber()).toBe(24_000);
    expect(r.schedule[1].amount.toNumber()).toBe(48_000);
    expect(r.schedule[0].amount.plus(r.schedule[1].amount).toNumber()).toBe(r.cost.toNumber());
  });

  it('некорректный срок → ошибка', () => {
    expect(() => calcPatent(2026, 1_000_000, 13)).toThrow();
  });
});
