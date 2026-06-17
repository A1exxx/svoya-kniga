/**
 * Тесты НДС для УСН. Эталонные значения совпадают с test_vat.py (Python).
 */
import { describe, expect, it } from 'vitest';
import { calcVatUsn, VAT_EXEMPT_THRESHOLD } from './vat.js';

describe('calcVatUsn — освобождение', () => {
  it('доход 50 млн → освобождение, НДС 0', () => {
    const r = calcVatUsn(2026, 50_000_000);
    expect(r.exempt).toBe(true);
    expect(r.obligated).toBe(false);
    expect(r.vat.toNumber()).toBe(0);
  });

  it('ровно 60 млн → ещё освобождение', () => {
    const r = calcVatUsn(2026, 60_000_000);
    expect(r.exempt).toBe(true);
    expect(r.vat.toNumber()).toBe(0);
  });

  it('режим none при доходе 100 млн → НДС 0', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'none' });
    expect(r.vat.toNumber()).toBe(0);
    expect(r.mode).toBe('none');
  });
});

describe('calcVatUsn — спец-ставки 5/7', () => {
  it('100 млн с НДС, авто → 5%, НДС 4 761 905', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'auto', incomeIncludesVat: true });
    expect(r.rate.toNumber()).toBe(5);
    expect(r.mode).toBe('rate5');
    expect(r.vat.toNumber()).toBe(4_761_905);
    expect(r.base.toNumber()).toBe(95_238_095);
  });

  it('100 млн без НДС → НДС 5% сверху = 5 000 000', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'auto', incomeIncludesVat: false });
    expect(r.rate.toNumber()).toBe(5);
    expect(r.vat.toNumber()).toBe(5_000_000);
    expect(r.base.toNumber()).toBe(100_000_000);
  });

  it('300 млн авто → 7%, НДС 19 626 168', () => {
    const r = calcVatUsn(2026, 300_000_000, { mode: 'auto', incomeIncludesVat: true });
    expect(r.rate.toNumber()).toBe(7);
    expect(r.mode).toBe('rate7');
    expect(r.vat.toNumber()).toBe(19_626_168);
  });
});

describe('calcVatUsn — общая 20%', () => {
  it('100 млн с НДС, вычет 5 млн → НДС 11 666 667', () => {
    const r = calcVatUsn(2026, 100_000_000, {
      mode: 'general20',
      incomeIncludesVat: true,
      inputVat: 5_000_000,
    });
    expect(r.rate.toNumber()).toBe(20);
    expect(r.vat.toNumber()).toBe(11_666_667);
    expect(r.input_vat_deducted.toNumber()).toBe(5_000_000);
  });

  it('вычет больше исходящего → НДС 0 (не отрицательный)', () => {
    const r = calcVatUsn(2026, 70_000_000, {
      mode: 'general20',
      incomeIncludesVat: true,
      inputVat: 50_000_000,
    });
    expect(r.vat.toNumber()).toBe(0);
  });
});

describe('calcVatUsn — прочее', () => {
  it('прошлый год 80 млн → обязанность по НДС', () => {
    const r = calcVatUsn(2026, 40_000_000, { priorYearIncome: 80_000_000, mode: 'auto' });
    expect(r.obligated).toBe(true);
    expect(r.rate.toNumber()).toBe(5);
  });

  it('отрицательный доход → ошибка', () => {
    expect(() => calcVatUsn(2026, -1)).toThrow();
  });

  it('порог = 60 млн', () => {
    expect(VAT_EXEMPT_THRESHOLD.toNumber()).toBe(60_000_000);
  });
});
