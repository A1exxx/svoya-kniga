/**
 * НДС для ИП на УСН (с 01.01.2025, Федеральный закон № 176-ФЗ).
 *
 * Зеркало backend/taxcore/vat.py — значения должны совпадать 1-в-1 с Python.
 *
 * Правила 2025 (ст. 145, 164 НК РФ):
 *   • Освобождение, если доход за предыдущий ИЛИ текущий год ≤ 60 млн ₽.
 *   • Спец-ставки: 5% при доходе 60–250 млн, 7% при 250–450 млн — без вычета входящего НДС.
 *   • Общая ставка 20% — с вычетом входящего НДС.
 *
 * ⚠️ С 2026 (ФЗ № 425-ФЗ от 28.11.2025) пороги/ставка ДРУГИЕ: освобождение ≤ 20 млн ₽,
 * спец-ставки до 272,5 / 490,5 млн (дефлятор 1,090), общая ставка 22%. Поэтому фактические
 * значения ВСЕГДА берутся из параметров года (getParams), а не из констант ниже.
 */
import Decimal from 'decimal.js';
import { roundRub, toDecimal, type DecimalLike } from './money.js';
import { getParams } from './params.js';

/**
 * @deprecated Историч. дефолты 2025 года. НЕ использовать в расчётах — фактические пороги/ставка
 * берутся из параметров года через getParams(year) (с 2026: освобождение 20 млн, общая 22%, ФЗ-425).
 * Оставлены только для обратной совместимости тестов; для логики всегда getParams.
 */
export const VAT_EXEMPT_THRESHOLD = new Decimal('60000000');
/** @deprecated См. VAT_EXEMPT_THRESHOLD — используйте getParams(year).vat_rate5_limit. */
export const VAT_RATE5_LIMIT = new Decimal('250000000');
/** @deprecated См. VAT_EXEMPT_THRESHOLD — используйте getParams(year).vat_rate7_limit. */
export const VAT_RATE7_LIMIT = new Decimal('450000000');

/** Режим НДС. Спец-ставки 5/7 — без вычета; 10/общая — с вычетом. `general` = ставка года. */
export type VatMode = 'auto' | 'none' | 'rate5' | 'rate7' | 'rate10' | 'general' | 'general20';

export interface VatResult {
  obligated: boolean;
  exempt: boolean;
  rate: Decimal;
  base: Decimal;
  vat: Decimal; // НДС к уплате (исходящий − вычет, не ниже 0)
  output_vat: Decimal; // исчисленный НДС с реализации (до вычета) — стр. 118 декларации
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

const D0 = () => new Decimal('0');

/** Расчёт НДС для ИП на УСН (пороги и общая ставка — из параметров года). */
export function calcVatUsn(year: number, income: DecimalLike, opts: CalcVatOptions = {}): VatResult {
  const { priorYearIncome = 0, incomeIncludesVat = true, inputVat = 0 } = opts;
  let mode: VatMode = opts.mode ?? 'auto';
  if (mode === 'general20') mode = 'general'; // обратная совместимость

  const p = getParams(year);
  const exemptThreshold = p.vat_exempt_threshold;
  const rate5Limit = p.vat_rate5_limit;
  const rate7Limit = p.vat_rate7_limit;
  const generalRate = p.vat_general_rate;

  const inc = toDecimal(income);
  const prior = toDecimal(priorYearIncome);
  if (inc.lt(0) || prior.lt(0)) {
    throw new Error('Доход не может быть отрицательным');
  }

  const thresholdBase = Decimal.max(inc, prior);
  const obligated = thresholdBase.gt(exemptThreshold);
  const notes: string[] = [];

  if (mode === 'none' || !obligated) {
    notes.push(
      obligated
        ? 'НДС не начисляется по выбору (режим «без НДС»).'
        : `Доход ≤ ${exemptThreshold.toFixed(0)} ₽ — освобождение от НДС (ст. 145 НК РФ).`
    );
    return {
      obligated,
      exempt: !obligated,
      rate: D0(),
      base: roundRub(inc),
      vat: D0(),
      output_vat: D0(),
      input_vat_deducted: D0(),
      mode: 'none',
      notes,
    };
  }

  // Спец-ставки 5/7 (и авто) недоступны при доходе выше потолка УСН — право на УСН утрачено.
  const specialRequested = mode === 'auto' || mode === 'rate5' || mode === 'rate7';
  if (specialRequested && inc.gt(rate7Limit)) {
    notes.push(
      `Доход превысил ${rate7Limit.toFixed(0)} ₽ — право на УСН утрачено: НДС по общей системе; ` +
        'спец-ставка 5/7% неприменима.'
    );
    return {
      obligated: true,
      exempt: false,
      rate: D0(),
      base: roundRub(inc),
      vat: D0(),
      output_vat: D0(),
      input_vat_deducted: D0(),
      mode: 'usn_lost',
      notes,
    };
  }

  let rate: Decimal;
  let appliedMode: string;
  let special: boolean;
  if (mode === 'general') {
    rate = generalRate;
    appliedMode = 'general';
    special = false;
  } else if (mode === 'rate10') {
    rate = new Decimal('10');
    appliedMode = 'rate10';
    special = false;
  } else {
    // Спец-ставка определяется доходом (ст. 164 НК): 5% до rate5Limit, иначе 7%.
    rate = inc.lte(rate5Limit) ? new Decimal('5') : new Decimal('7');
    appliedMode = rate.eq(5) ? 'rate5' : 'rate7';
    special = true;
    if (mode === 'rate5' && !rate.eq(5)) {
      notes.push(`При доходе свыше ${rate5Limit.toFixed(0)} ₽ применяется 7%, а не 5% (ст. 164 НК РФ).`);
    } else if (mode === 'rate7' && !rate.eq(7)) {
      notes.push(`При доходе до ${rate5Limit.toFixed(0)} ₽ применяется 5%, а не 7% (ст. 164 НК РФ).`);
    }
  }

  let base: Decimal;
  let vat: Decimal;
  let deducted: Decimal;
  let output: Decimal; // исчисленный НДС с реализации (до вычета) — стр. 118 декларации

  if (special) {
    // Спец-ставки: база = выручка без НДС, вычет входящего не применяется.
    if (incomeIncludesVat) {
      base = inc.div(new Decimal('1').plus(rate.div(100)));
      vat = inc.minus(base);
    } else {
      base = inc;
      vat = inc.times(rate).div(100);
    }
    deducted = D0();
    output = vat; // без вычета исчисленный = к уплате
    notes.push(`Специальная ставка ${rate}% — без вычета входящего НДС (ст. 170 НК РФ).`);
  } else {
    // Общая ставка (10/20/22): НДС = исходящий − входящий.
    if (incomeIncludesVat) {
      base = inc.div(new Decimal('1').plus(rate.div(100)));
      output = inc.minus(base);
    } else {
      base = inc;
      output = inc.times(rate).div(100);
    }
    deducted = toDecimal(inputVat);
    if (deducted.lt(0)) {
      throw new Error('Входящий НДС не может быть отрицательным');
    }
    vat = output.minus(deducted);
    if (vat.lt(0)) vat = D0();
    notes.push(`Общая ставка ${rate}% — с вычетом входящего НДС (ст. 171–172 НК РФ).`);
  }

  return {
    obligated: true,
    exempt: false,
    rate,
    base: roundRub(base),
    vat: roundRub(vat),
    output_vat: roundRub(output),
    input_vat_deducted: roundRub(deducted),
    mode: appliedMode,
    notes,
  };
}
