/**
 * Зарплатные калькуляторы ИП-работодателя: НДФЛ, страховые взносы с ФОТ,
 * отпускные, больничные, алименты.
 *
 * Данные 2025/2026 выверены по источникам (ст. 224/218/226/427 НК РФ, ФЗ № 176-ФЗ,
 * ФЗ № 255-ФЗ, ст. 139 ТК РФ). Значения подлежат финальной проверке бухгалтером.
 *
 * ВАЖНЫЕ ПРИНЦИПЫ:
 *   • НДФЛ — прогрессивная шкала 13/15/18/20/22%, считается НАРАСТАЮЩИМ ИТОГОМ с начала года
 *     (ст. 226 НК РФ). Месячный налог = налог_по_шкале(доход_нараст − вычеты_нараст) минус
 *     уже удержанный с начала года.
 *   • Стандартные вычеты на детей применяются, пока доход нарастающим итогом ≤ 450 000 ₽ (2025+).
 *   • Страховые взносы — единый тариф 30% до предельной базы и 15,1% сверх; для МСП льгота:
 *     с части выплаты свыше 1,5 МРОТ/мес — 15%. Травматизм (0,2%+) — отдельно, без базы.
 *   • Отпускные: среднедневной = база за 12 мес ÷ 12 ÷ 29,3 (ст. 139 ТК РФ).
 *   • Больничные: среднедневной = заработок за 2 года ÷ 730, с учётом стажа, мин (МРОТ) и
 *     макс (предельные базы) ограничений; первые 3 дня — за счёт работодателя.
 */

import Decimal from 'decimal.js';
import { money, roundRub, toDecimal, type DecimalLike } from './money.js';

// ---------------------------------------------------------------------------
// Параметры расчётного года
// ---------------------------------------------------------------------------

export interface PayrollParams {
  year: number;
  /** МРОТ */
  mrot: Decimal;
  /** Предел дохода для детских вычетов (450 000) */
  deduction_income_limit: Decimal;
  /** Вычет на 1-го ребёнка */
  child_first: Decimal;
  /** Вычет на 2-го */
  child_second: Decimal;
  /** Вычет на 3-го и каждого последующего */
  child_third_plus: Decimal;
  /** Вычет на ребёнка-инвалида (суммируется с очередным) */
  child_disabled: Decimal;
  /** Единый тариф до предельной базы (0.30) */
  vznosy_rate: Decimal;
  /** Тариф сверх предельной базы (0.151) */
  vznosy_rate_over: Decimal;
  /** Предельная база взносов за год */
  vznosy_limit_base: Decimal;
  /** Льготный тариф МСП с части свыше 1,5 МРОТ (0.15) */
  msp_rate: Decimal;
  /** Множитель МРОТ для порога льготы (1.5) */
  msp_mrot_factor: Decimal;
  /** Травматизм по умолчанию (0.002) */
  travmatizm_default: Decimal;
  verified: boolean;
  note: string;
}

const D = (s: string) => new Decimal(s);

/** Прогрессивная шкала НДФЛ (одинакова для 2025 и 2026), ст. 224 НК РФ (ред. ФЗ № 176-ФЗ).
 *  [верхняя граница ступени | null для последней, ставка] */
export const NDFL_TIERS: Array<[Decimal | null, Decimal]> = [
  [D('2400000'), D('0.13')],
  [D('5000000'), D('0.15')],
  [D('20000000'), D('0.18')],
  [D('50000000'), D('0.20')],
  [null, D('0.22')],
];

/** Предельная база для больничных (заработок каждого из 2 прошлых лет ограничен базой того года). */
export const SICK_LEAVE_BASE_BY_YEAR: Record<number, Decimal> = {
  2022: D('1565000'),
  2023: D('1917000'),
  2024: D('2225000'),
  2025: D('2759000'),
  2026: D('2979000'),
};

export const PAYROLL: Record<number, PayrollParams> = {
  2025: {
    year: 2025,
    mrot: D('22440'),
    deduction_income_limit: D('450000'),
    child_first: D('1400'),
    child_second: D('2800'),
    child_third_plus: D('6000'),
    child_disabled: D('12000'),
    vznosy_rate: D('0.30'),
    vznosy_rate_over: D('0.151'),
    vznosy_limit_base: D('2759000'),
    msp_rate: D('0.15'),
    msp_mrot_factor: D('1.5'),
    travmatizm_default: D('0.002'),
    verified: true,
    note:
      'МРОТ 22 440 ₽; предельная база взносов 2 759 000 ₽; вычеты на детей удвоены со 2-го ' +
      '(ст. 218 НК РФ); предел дохода для вычетов 450 000 ₽.',
  },
  2026: {
    year: 2026,
    mrot: D('27093'),
    deduction_income_limit: D('450000'),
    child_first: D('1400'),
    child_second: D('2800'),
    child_third_plus: D('6000'),
    child_disabled: D('12000'),
    vznosy_rate: D('0.30'),
    vznosy_rate_over: D('0.151'),
    vznosy_limit_base: D('2979000'),
    msp_rate: D('0.15'),
    msp_mrot_factor: D('1.5'),
    travmatizm_default: D('0.002'),
    verified: true,
    note:
      'МРОТ 27 093 ₽ (ФЗ № 429-ФЗ); предельная база взносов 2 979 000 ₽; шкала НДФЛ и ' +
      'вычеты как в 2025. МСП-льгота 15% для приоритетных ОКВЭД (проверить применимость).',
  },
};

export function getPayroll(year: number): PayrollParams {
  if (year in PAYROLL) {
    return PAYROLL[year];
  }
  throw new Error(
    `Нет зарплатных параметров за ${year} год. Известные годы: ${Object.keys(PAYROLL).sort().join(', ')}.`
  );
}

// ---------------------------------------------------------------------------
// НДФЛ — прогрессивная шкала
// ---------------------------------------------------------------------------

/**
 * НДФЛ по прогрессивной шкале с годовой базы (нарастающим итогом). В полных рублях.
 */
export function ndflProgressive(base: DecimalLike): Decimal {
  const b = toDecimal(base);
  if (b.lte(0)) return new Decimal('0');
  let tax = new Decimal('0');
  let lower = new Decimal('0');
  for (const [upper, rate] of NDFL_TIERS) {
    if (upper === null || b.lte(upper)) {
      tax = tax.plus(b.minus(lower).times(rate));
      break;
    }
    tax = tax.plus(upper.minus(lower).times(rate));
    lower = upper;
  }
  return roundRub(tax);
}

// ---------------------------------------------------------------------------
// Детские вычеты
// ---------------------------------------------------------------------------

/**
 * Месячная сумма стандартных вычетов на детей.
 */
export function childDeductionMonthly(
  year: number,
  children = 0,
  disabledChildren = 0,
  singleParent = false
): Decimal {
  const p = getPayroll(year);
  let total = new Decimal('0');
  for (let i = 1; i <= children; i++) {
    if (i === 1) {
      total = total.plus(p.child_first);
    } else if (i === 2) {
      total = total.plus(p.child_second);
    } else {
      total = total.plus(p.child_third_plus);
    }
  }
  total = total.plus(p.child_disabled.times(disabledChildren));
  if (singleParent) {
    total = total.times(2);
  }
  return money(total);
}

// ---------------------------------------------------------------------------
// Зарплата (проекция на months месяцев, равный оклад)
// ---------------------------------------------------------------------------

export interface SalaryMonth {
  month: number;
  gross: Decimal;
  deduction_applied: Decimal;
  ndfl: Decimal;
  net: Decimal;
  /** Страховые взносы (единый тариф / МСП) */
  vznosy: Decimal;
  /** Взносы на травматизм */
  travmatizm: Decimal;
}

export interface SalaryResult {
  year: number;
  monthly_gross: Decimal;
  msp: boolean;
  months: SalaryMonth[];
  // Годовые итоги
  gross_year: Decimal;
  ndfl_year: Decimal;
  net_year: Decimal;
  vznosy_year: Decimal;
  travmatizm_year: Decimal;
  /** gross + взносы + травматизм */
  employer_cost_year: Decimal;
  child_deduction_monthly: Decimal;
  notes: string[];
}

export interface CalcSalaryOptions {
  children?: number;
  disabledChildren?: number;
  singleParent?: boolean;
  msp?: boolean;
  travmatizmRate?: DecimalLike;
  months?: number;
}

/**
 * Расчёт зарплаты сотрудника: НДФЛ (прогрессия + детские вычеты, нарастающим итогом),
 * страховые взносы (с льготой МСП) и стоимость для работодателя — проекция на `months`
 * при равном окладе.
 */
export function calcSalary(
  year: number,
  monthlyGross: DecimalLike,
  opts: CalcSalaryOptions = {}
): SalaryResult {
  const {
    children = 0,
    disabledChildren = 0,
    singleParent = false,
    msp = true,
    months = 12,
  } = opts;

  const p = getPayroll(year);
  const gross = toDecimal(monthlyGross);
  if (gross.lt(0)) {
    throw new Error('Оклад не может быть отрицательным');
  }
  const travmRate =
    opts.travmatizmRate !== undefined ? toDecimal(opts.travmatizmRate) : p.travmatizm_default;
  const dedMonth = childDeductionMonthly(year, children, disabledChildren, singleParent);
  const mspThreshold = p.mrot.times(p.msp_mrot_factor);

  const rows: SalaryMonth[] = [];
  let cumIncome = new Decimal('0');
  let cumDeductions = new Decimal('0');
  let cumNdfl = new Decimal('0');
  let cumBaseVznosy = new Decimal('0');
  const notes: string[] = [];

  if (!p.verified) {
    notes.push(`Зарплатные параметры ${year} года не сверены — проверить.`);
  }

  for (let m = 1; m <= months; m++) {
    cumIncome = cumIncome.plus(gross);

    // Вычет применяется, пока доход нарастающим итогом не превысил предел.
    const dedApplied = cumIncome.lte(p.deduction_income_limit) ? dedMonth : new Decimal('0');
    cumDeductions = cumDeductions.plus(dedApplied);

    let taxableCum = cumIncome.minus(cumDeductions);
    if (taxableCum.lt(0)) taxableCum = new Decimal('0');

    const ndflCum = ndflProgressive(taxableCum);
    let ndflMonth = ndflCum.minus(cumNdfl);
    if (ndflMonth.lt(0)) ndflMonth = new Decimal('0');
    cumNdfl = ndflCum;

    const net = money(gross.minus(ndflMonth));

    // Страховые взносы
    let vznosy: Decimal;
    if (msp) {
      const under = Decimal.min(gross, mspThreshold);
      let over = gross.minus(under);
      if (over.lt(0)) over = new Decimal('0');
      vznosy = under.times(p.vznosy_rate).plus(over.times(p.msp_rate));
    } else {
      const baseBefore = cumBaseVznosy;
      const baseAfter = cumBaseVznosy.plus(gross);
      let at30 = Decimal.min(baseAfter, p.vznosy_limit_base).minus(
        Decimal.min(baseBefore, p.vznosy_limit_base)
      );
      if (at30.lt(0)) at30 = new Decimal('0');
      const atOver = gross.minus(at30);
      vznosy = at30.times(p.vznosy_rate).plus(atOver.times(p.vznosy_rate_over));
      cumBaseVznosy = baseAfter;
    }

    const travmatizm = gross.times(travmRate);

    rows.push({
      month: m,
      gross: money(gross),
      deduction_applied: money(dedApplied),
      ndfl: money(ndflMonth),
      net,
      vznosy: money(vznosy),
      travmatizm: money(travmatizm),
    });
  }

  const sumField = (fn: (r: SalaryMonth) => Decimal) =>
    rows.reduce((s, r) => s.plus(fn(r)), new Decimal('0'));

  const grossYear = money(sumField((r) => r.gross));
  const ndflYear = money(sumField((r) => r.ndfl));
  const netYear = money(sumField((r) => r.net));
  const vznosyYear = money(sumField((r) => r.vznosy));
  const travmYear = money(sumField((r) => r.travmatizm));

  return {
    year,
    monthly_gross: money(gross),
    msp,
    months: rows,
    gross_year: grossYear,
    ndfl_year: ndflYear,
    net_year: netYear,
    vznosy_year: vznosyYear,
    travmatizm_year: travmYear,
    employer_cost_year: money(grossYear.plus(vznosyYear).plus(travmYear)),
    child_deduction_monthly: dedMonth,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Отпускные
// ---------------------------------------------------------------------------

export interface VacationResult {
  year: number;
  /** Среднедневной заработок (СДЗ) */
  avg_daily: Decimal;
  /** Минимальный СДЗ из МРОТ */
  min_daily: Decimal;
  days: number;
  /** Начислено отпускных */
  gross: Decimal;
  ndfl: Decimal;
  net: Decimal;
  notes: string[];
}

/**
 * Отпускные: СДЗ = база за 12 мес ÷ 12 ÷ 29,3 (ст. 139 ТК РФ). НДФЛ упрощённо 13%.
 */
export function calcVacation(
  year: number,
  base12m: DecimalLike,
  vacationDays: number
): VacationResult {
  const p = getPayroll(year);
  const base = toDecimal(base12m);
  const avgDailyRaw = base.div(new Decimal('12')).div(new Decimal('29.3'));
  const minDaily = p.mrot.div(new Decimal('29.3'));
  const avgDaily = Decimal.max(avgDailyRaw, minDaily);
  const gross = money(avgDaily.times(vacationDays));
  const ndfl = roundRub(gross.times(new Decimal('0.13')));
  const notes = [
    'НДФЛ с отпускных взят упрощённо 13% (без прогрессии и вычетов) — сверить.',
  ];
  return {
    year,
    avg_daily: money(avgDaily),
    min_daily: money(minDaily),
    days: vacationDays,
    gross,
    ndfl: money(ndfl),
    net: money(gross.minus(ndfl)),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Больничные
// ---------------------------------------------------------------------------

export interface SickLeaveResult {
  year: number;
  avg_daily_fact: Decimal;
  min_daily: Decimal;
  max_daily: Decimal;
  avg_daily_used: Decimal;
  stazh_coeff: Decimal;
  daily_benefit: Decimal;
  total: Decimal;
  /** Первые дни за счёт работодателя */
  employer_part: Decimal;
  /** За счёт СФР */
  sfr_part: Decimal;
  ndfl: Decimal;
  net: Decimal;
  notes: string[];
}

/**
 * Больничный: СДЗ = (заработок за 2 пред. года, каждый ≤ предельной базы) ÷ 730,
 * с учётом стажа и ограничений мин/макс. Первые `employerDays` дней — за счёт работодателя.
 */
export function calcSickLeave(
  year: number,
  earningsPrev1: DecimalLike,
  earningsPrev2: DecimalLike,
  stazhYears: number,
  sickDays: number,
  employerDays = 3
): SickLeaveResult {
  const p = getPayroll(year);
  const y1 = year - 1;
  const y2 = year - 2;
  const cap1: Decimal | undefined = SICK_LEAVE_BASE_BY_YEAR[y1];
  const cap2: Decimal | undefined = SICK_LEAVE_BASE_BY_YEAR[y2];
  let e1 = toDecimal(earningsPrev1);
  let e2 = toDecimal(earningsPrev2);
  const notes: string[] = [];

  if (cap1 !== undefined) {
    e1 = Decimal.min(e1, cap1);
  } else {
    notes.push(`Нет предельной базы за ${y1} год — проверить ограничение.`);
  }
  if (cap2 !== undefined) {
    e2 = Decimal.min(e2, cap2);
  } else {
    notes.push(`Нет предельной базы за ${y2} год — проверить ограничение.`);
  }

  const avgDailyFact = e1.plus(e2).div(new Decimal('730'));
  const minDaily = p.mrot.times(new Decimal('24')).div(new Decimal('730'));
  const maxCap1 = cap1 !== undefined ? cap1 : p.vznosy_limit_base;
  const maxCap2 = cap2 !== undefined ? cap2 : p.vznosy_limit_base;
  const maxDaily = maxCap1.plus(maxCap2).div(new Decimal('730'));

  let avg = Decimal.max(avgDailyFact, minDaily);
  avg = Decimal.min(avg, maxDaily);

  let coeff: Decimal;
  if (stazhYears >= 8) {
    coeff = new Decimal('1.0');
  } else if (stazhYears >= 5) {
    coeff = new Decimal('0.8');
  } else {
    coeff = new Decimal('0.6');
  }

  const dailyBenefit = money(avg.times(coeff));
  const total = money(dailyBenefit.times(sickDays));
  const empDays = Math.min(employerDays, sickDays);
  const employerPart = money(dailyBenefit.times(empDays));
  const sfrPart = money(total.minus(employerPart));
  const ndfl = roundRub(total.times(new Decimal('0.13')));

  return {
    year,
    avg_daily_fact: money(avgDailyFact),
    min_daily: money(minDaily),
    max_daily: money(maxDaily),
    avg_daily_used: money(avg),
    stazh_coeff: coeff,
    daily_benefit: dailyBenefit,
    total,
    employer_part: employerPart,
    sfr_part: sfrPart,
    ndfl: money(ndfl),
    net: money(total.minus(ndfl)),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Алименты
// ---------------------------------------------------------------------------

export interface AlimonyResult {
  salary_gross: Decimal;
  ndfl: Decimal;
  base_after_ndfl: Decimal;
  share_label: string;
  alimony: Decimal;
  /** Упёрлись ли в максимум 70% */
  capped: boolean;
  notes: string[];
}

const ALIMONY_SHARES: Record<number, Decimal> = {
  1: new Decimal('1').div(4),
  2: new Decimal('1').div(3),
  3: new Decimal('1').div(2),
};

const ALIMONY_LABELS: Record<number, string> = { 1: '1/4', 2: '1/3', 3: '1/2' };

/**
 * Алименты: доля от (зарплата − НДФЛ). 1 ребёнок — 1/4, 2 — 1/3, 3+ — 1/2 (ст. 81 СК РФ).
 * Максимум удержания на детей — 70% (ст. 99 ФЗ № 229-ФЗ).
 */
export function calcAlimony(
  salaryGross: DecimalLike,
  ndfl: DecimalLike,
  children: number
): AlimonyResult {
  const gross = toDecimal(salaryGross);
  const ndflD = toDecimal(ndfl);
  let base = gross.minus(ndflD);
  if (base.lt(0)) base = new Decimal('0');

  const n = Math.max(1, Math.min(children, 3));
  const share = ALIMONY_SHARES[n];
  const label = ALIMONY_LABELS[n];
  const raw = base.times(share);
  const cap = base.times(new Decimal('0.70'));
  const capped = raw.gt(cap);
  const alimony = capped ? cap : raw;

  const notes: string[] = [];
  if (capped) {
    notes.push('Применён максимум удержания 70% (ст. 99 ФЗ № 229-ФЗ).');
  }

  return {
    salary_gross: money(gross),
    ndfl: money(ndflD),
    base_after_ndfl: money(base),
    share_label: label,
    alimony: money(alimony),
    capped,
    notes,
  };
}
