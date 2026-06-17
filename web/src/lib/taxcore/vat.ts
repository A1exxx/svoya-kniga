/**
 * НДС для ИП на УСН (с 01.01.2025, Федеральный закон № 176-ФЗ).
 *
 * Зеркало backend/taxcore/vat.py — значения должны совпадать 1-в-1 с Python.
 *
 * Правила (2025–2026):
 *   • Освобождение, если доход за предыдущий ИЛИ текущий год ≤ 60 млн ₽ (ст. 145 НК РФ).
 *   • Спец-ставки (ст. 164): 5% при доходе 60–250 млн, 7% при 250–450 млн — без вычета
 *     входящего НДС.
 *   • Общая ставка 20% — с вычетом входящего НДС.
 *
 * ⚠️ Пороги 60/250/450 млн — на 2025–2026; с 2027 порог освобождения планово снижается.
 */
import Decimal from 'decimal.js';
import { roundRub, toDecimal, type DecimalLike } from './money.js';

export const VAT_EXEMPT_THRESHOLD = new Decimal('60000000'); // ≤ → освобождение
export const VAT_RATE5_LIMIT = new Decimal('250000000'); // 60–250 млн → 5%
export const VAT_RATE7_LIMIT = new Decimal('450000000'); // 250–450 млн → 7%

export type VatMode = 'auto' | 'none' | 'rate5' | 'rate7' | 'general20';

export interface VatResult {
  obligated: boolean;
  exempt: boolean;
  rate: Decimal;
  base: Decimal;
  vat: Decimal;
  input_vat_deducted: Decimal;
  mode: string;
  notes: string[];
}

export interface CalcVatOptions {
  priorYearIncome?: DecimalLike;
  mode?: VatMode;
  incomeIncludesVat?: boolean;
  inputVat?: DecimalLike;
}

/** Расчёт НДС для ИП на УСН. */
export function calcVatUsn(year: number, income: DecimalLike, opts: CalcVatOptions = {}): VatResult {
  const { priorYearIncome = 0, mode = 'auto', incomeIncludesVat = true, inputVat = 0 } = opts;
  const inc = toDecimal(income);
  const prior = toDecimal(priorYearIncome);
  if (inc.lt(0) || prior.lt(0)) {
    throw new Error('Доход не может быть отрицательным');
  }

  const thresholdBase = Decimal.max(inc, prior);
  const obligated = thresholdBase.gt(VAT_EXEMPT_THRESHOLD);
  const notes: string[] = [];

  if (year >= 2027) {
    notes.push(
      'С 2027 порог освобождения от НДС планово снижается (15 млн ₽) — проверить актуальное значение.'
    );
  }

  if (mode === 'none' || (mode === 'auto' && !obligated)) {
    notes.push(
      obligated
        ? 'НДС не начисляется по выбору (режим «без НДС»).'
        : 'Доход ≤ 60 млн ₽ — освобождение от НДС (ст. 145 НК РФ).'
    );
    return {
      obligated,
      exempt: !obligated,
      rate: new Decimal('0'),
      base: roundRub(inc),
      vat: new Decimal('0'),
      input_vat_deducted: new Decimal('0'),
      mode: 'none',
      notes,
    };
  }

  // Доход выше потолка УСН (450 млн) — спец-ставки 5/7% неприменимы (право на УСН утрачено).
  if ((mode === 'auto' || mode === 'rate5' || mode === 'rate7') && inc.gt(VAT_RATE7_LIMIT)) {
    notes.push(
      'Доход превысил 450 млн ₽ — право на УСН утрачено: НДС по общей системе (ОСНО, 20%); ' +
        'спец-ставка 5/7% неприменима.'
    );
    return {
      obligated: true,
      exempt: false,
      rate: new Decimal('0'),
      base: roundRub(inc),
      vat: new Decimal('0'),
      input_vat_deducted: new Decimal('0'),
      mode: 'usn_lost',
      notes,
    };
  }

  let rate: Decimal;
  let appliedMode: string;
  if (mode === 'auto') {
    rate = inc.lte(VAT_RATE5_LIMIT) ? new Decimal('5') : new Decimal('7');
    appliedMode = rate.eq(5) ? 'rate5' : 'rate7';
  } else if (mode === 'rate5') {
    rate = new Decimal('5');
    appliedMode = 'rate5';
  } else if (mode === 'rate7') {
    rate = new Decimal('7');
    appliedMode = 'rate7';
  } else if (mode === 'general20') {
    rate = new Decimal('20');
    appliedMode = 'general20';
  } else {
    throw new Error(`Неизвестный режим НДС: ${mode}`);
  }

  if (inc.gt(VAT_RATE7_LIMIT)) {
    notes.push('Доход превышает 450 млн ₽ — утрата права на УСН, проверить отдельно.');
  }

  let base: Decimal;
  let vat: Decimal;
  let deducted: Decimal;

  if (rate.eq(5) || rate.eq(7)) {
    // Спец-ставки: база = выручка без НДС, вычет входящего не применяется.
    if (incomeIncludesVat) {
      base = inc.div(new Decimal('1').plus(rate.div(100)));
      vat = inc.minus(base);
    } else {
      base = inc;
      vat = inc.times(rate).div(100);
    }
    deducted = new Decimal('0');
    notes.push(`Специальная ставка ${rate}% — без вычета входящего НДС (ст. 170 НК РФ).`);
  } else {
    // Общая ставка 20%: НДС = исходящий − входящий.
    let output: Decimal;
    if (incomeIncludesVat) {
      base = inc.div(new Decimal('1.20'));
      output = inc.minus(base);
    } else {
      base = inc;
      output = inc.times('0.20');
    }
    deducted = toDecimal(inputVat);
    if (deducted.lt(0)) {
      throw new Error('Входящий НДС не может быть отрицательным');
    }
    vat = output.minus(deducted);
    if (vat.lt(0)) vat = new Decimal('0');
    notes.push('Общая ставка 20% — с вычетом входящего НДС (ст. 171–172 НК РФ).');
  }

  return {
    obligated: true,
    exempt: false,
    rate,
    base: roundRub(base),
    vat: roundRub(vat),
    input_vat_deducted: roundRub(deducted),
    mode: appliedMode,
    notes,
  };
}
