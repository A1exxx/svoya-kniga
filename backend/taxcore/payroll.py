"""Зарплатные калькуляторы ИП-работодателя: НДФЛ, страховые взносы с ФОТ,
отпускные, больничные, алименты.

Данные 2025/2026 выверены по источникам (ст. 224/218/226/427 НК РФ, ФЗ № 176-ФЗ,
ФЗ № 255-ФЗ, ст. 139 ТК РФ). Значения подлежат финальной проверке бухгалтером.

ВАЖНЫЕ ПРИНЦИПЫ:
  • НДФЛ — прогрессивная шкала 13/15/18/20/22%, считается НАРАСТАЮЩИМ ИТОГОМ с начала года
    (ст. 226 НК РФ). Месячный налог = налог_по_шкале(доход_нараст − вычеты_нараст) минус
    уже удержанный с начала года.
  • Стандартные вычеты на детей применяются, пока доход нарастающим итогом ≤ 450 000 ₽ (2025+).
  • Страховые взносы — единый тариф 30% до предельной базы и 15,1% сверх; для МСП льгота:
    с части выплаты свыше 1,5 МРОТ/мес — 15%. Травматизм (0,2%+) — отдельно, без базы.
  • Отпускные: среднедневной = база за 12 мес ÷ 12 ÷ 29,3 (ст. 139 ТК РФ).
  • Больничные: среднедневной = заработок за 2 года ÷ 730, с учётом стажа, мин (МРОТ) и
    макс (предельные базы) ограничений; первые 3 дня — за счёт работодателя.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .models import money, round_rub, to_decimal

__all__ = [
    "PayrollParams",
    "PAYROLL",
    "get_payroll",
    "ndfl_progressive",
    "child_deduction_monthly",
    "SalaryMonth",
    "SalaryResult",
    "calc_salary",
    "VacationResult",
    "calc_vacation",
    "SickLeaveResult",
    "calc_sick_leave",
    "AlimonyResult",
    "calc_alimony",
]

_D = to_decimal

# Прогрессивная шкала НДФЛ (одинакова для 2025 и 2026), ст. 224 НК РФ (ред. ФЗ № 176-ФЗ).
# (верхняя граница ступени | None для последней, ставка)
NDFL_TIERS: list[tuple[Decimal | None, Decimal]] = [
    (_D("2400000"), _D("0.13")),
    (_D("5000000"), _D("0.15")),
    (_D("20000000"), _D("0.18")),
    (_D("50000000"), _D("0.20")),
    (None, _D("0.22")),
]

# Предельная база для больничных (заработок каждого из 2 прошлых лет ограничен базой того года).
SICK_LEAVE_BASE_BY_YEAR: dict[int, Decimal] = {
    2022: _D("1565000"),
    2023: _D("1917000"),
    2024: _D("2225000"),
    2025: _D("2759000"),
    2026: _D("2979000"),
}


@dataclass(frozen=True)
class PayrollParams:
    year: int
    mrot: Decimal                       # МРОТ
    deduction_income_limit: Decimal     # предел дохода для детских вычетов (450 000)
    child_first: Decimal                # вычет на 1-го ребёнка
    child_second: Decimal               # на 2-го
    child_third_plus: Decimal           # на 3-го и каждого последующего
    child_disabled: Decimal             # на ребёнка-инвалида (суммируется с очередным)
    vznosy_rate: Decimal                # единый тариф до предельной базы (0.30)
    vznosy_rate_over: Decimal           # тариф сверх предельной базы (0.151)
    vznosy_limit_base: Decimal          # предельная база взносов за год
    msp_rate: Decimal                   # льготный тариф МСП с части свыше 1,5 МРОТ (0.15)
    msp_mrot_factor: Decimal            # множитель МРОТ для порога льготы (1.5)
    travmatizm_default: Decimal         # травматизм по умолчанию (0.002)
    verified: bool
    note: str = ""


PAYROLL: dict[int, PayrollParams] = {
    2025: PayrollParams(
        year=2025,
        mrot=_D("22440"),
        deduction_income_limit=_D("450000"),
        child_first=_D("1400"),
        child_second=_D("2800"),
        child_third_plus=_D("6000"),
        child_disabled=_D("12000"),
        vznosy_rate=_D("0.30"),
        vznosy_rate_over=_D("0.151"),
        vznosy_limit_base=_D("2759000"),
        msp_rate=_D("0.15"),
        msp_mrot_factor=_D("1.5"),
        travmatizm_default=_D("0.002"),
        verified=True,
        note="МРОТ 22 440 ₽; предельная база взносов 2 759 000 ₽; вычеты на детей удвоены со 2-го "
             "(ст. 218 НК РФ); предел дохода для вычетов 450 000 ₽.",
    ),
    2026: PayrollParams(
        year=2026,
        mrot=_D("27093"),
        deduction_income_limit=_D("450000"),
        child_first=_D("1400"),
        child_second=_D("2800"),
        child_third_plus=_D("6000"),
        child_disabled=_D("12000"),
        vznosy_rate=_D("0.30"),
        vznosy_rate_over=_D("0.151"),
        vznosy_limit_base=_D("2979000"),
        msp_rate=_D("0.15"),
        msp_mrot_factor=_D("1.5"),
        travmatizm_default=_D("0.002"),
        verified=True,
        note="МРОТ 27 093 ₽ (ФЗ № 429-ФЗ); предельная база взносов 2 979 000 ₽; шкала НДФЛ и "
             "вычеты как в 2025. МСП-льгота 15% для приоритетных ОКВЭД (проверить применимость).",
    ),
}


def get_payroll(year: int) -> PayrollParams:
    if year in PAYROLL:
        return PAYROLL[year]
    raise KeyError(
        f"Нет зарплатных параметров за {year} год. Известные годы: {sorted(PAYROLL)}."
    )


def ndfl_progressive(base) -> Decimal:
    """НДФЛ по прогрессивной шкале с годовой базы (нарастающим итогом). В полных рублях."""
    base = to_decimal(base)
    if base <= 0:
        return Decimal("0")
    tax = Decimal("0")
    lower = Decimal("0")
    for upper, rate in NDFL_TIERS:
        if upper is None or base <= upper:
            tax += (base - lower) * rate
            break
        tax += (upper - lower) * rate
        lower = upper
    return round_rub(tax)


def child_deduction_monthly(
    year: int,
    children: int = 0,
    disabled_children: int = 0,
    single_parent: bool = False,
) -> Decimal:
    """Месячная сумма стандартных вычетов на детей."""
    p = get_payroll(year)
    if children < 0 or disabled_children < 0:
        raise ValueError("Количество детей не может быть отрицательным")
    if disabled_children > children:
        raise ValueError("Детей-инвалидов не может быть больше общего числа детей")
    total = Decimal("0")
    for i in range(1, children + 1):
        if i == 1:
            total += p.child_first
        elif i == 2:
            total += p.child_second
        else:
            total += p.child_third_plus
    total += p.child_disabled * disabled_children
    if single_parent:
        total *= 2
    return money(total)


# ---------- Зарплата (проекция на 12 месяцев, равный оклад) ----------

@dataclass
class SalaryMonth:
    month: int
    gross: Decimal
    deduction_applied: Decimal
    ndfl: Decimal
    net: Decimal
    vznosy: Decimal           # страховые взносы (единый тариф/МСП)
    travmatizm: Decimal       # взносы на травматизм
    # Разбивка на аванс (1-я половина месяца) и окончательный расчёт.
    # Инвариант: ndfl == advance_ndfl + settlement_ndfl (декомпозиция, не новый итог).
    advance_gross: Decimal = Decimal("0")
    advance_ndfl: Decimal = Decimal("0")
    advance_net: Decimal = Decimal("0")
    settlement_gross: Decimal = Decimal("0")
    settlement_ndfl: Decimal = Decimal("0")
    settlement_net: Decimal = Decimal("0")


@dataclass
class SalaryResult:
    year: int
    monthly_gross: Decimal
    msp: bool
    months: list[SalaryMonth]
    # Годовые итоги
    gross_year: Decimal
    ndfl_year: Decimal
    net_year: Decimal
    vznosy_year: Decimal
    travmatizm_year: Decimal
    employer_cost_year: Decimal   # gross + взносы + травматизм
    child_deduction_monthly: Decimal
    advance_ndfl_year: Decimal = Decimal("0")       # НДФЛ с авансов за год (часть ndfl_year)
    settlement_ndfl_year: Decimal = Decimal("0")    # НДФЛ с расчётов за год (часть ndfl_year)
    notes: list[str] = field(default_factory=list)


def calc_salary(
    year: int,
    monthly_gross,
    children: int = 0,
    disabled_children: int = 0,
    single_parent: bool = False,
    msp: bool = True,
    travmatizm_rate=None,
    months: int = 12,
    advance_percent=Decimal("0"),
    month_factors=None,
) -> SalaryResult:
    """Расчёт зарплаты сотрудника: НДФЛ (прогрессия + детские вычеты, нарастающим итогом),
    страховые взносы (с льготой МСП) и стоимость для работодателя — проекция на `months`
    при равном окладе. advance_percent (доля 0..1) — разбивка на аванс/расчёт.
    month_factors — список долей отработанного времени по месяцам (0..1), отсутствующий
    элемент = 1 (полный месяц); оклад месяца = оклад × доля (НДФЛ остаётся нарастающим итогом)."""
    p = get_payroll(year)
    base_gross = to_decimal(monthly_gross)
    if base_gross < 0:
        raise ValueError("Оклад не может быть отрицательным")

    def factor_at(i0: int) -> Decimal:
        if month_factors is None or i0 >= len(month_factors):
            return Decimal("1")
        f = month_factors[i0]
        if f is None:
            return Decimal("1")
        d = to_decimal(f)
        if d < 0:
            d = Decimal("0")
        if d > 1:
            d = Decimal("1")
        return d
    advance_share = to_decimal(advance_percent)
    if advance_share < 0:
        advance_share = Decimal("0")
    if advance_share > 1:
        advance_share = Decimal("1")
    travm_rate = p.travmatizm_default if travmatizm_rate is None else to_decimal(travmatizm_rate)
    ded_month = child_deduction_monthly(year, children, disabled_children, single_parent)
    msp_threshold = p.mrot * p.msp_mrot_factor

    rows: list[SalaryMonth] = []
    cum_income = Decimal("0")
    cum_deductions = Decimal("0")
    cum_ndfl = Decimal("0")
    cum_base_vznosy = Decimal("0")
    notes: list[str] = []
    if not p.verified:
        notes.append(f"Зарплатные параметры {year} года не сверены — проверить.")

    for m in range(1, months + 1):
        cum_ndfl_before = cum_ndfl
        gross = money(base_gross * factor_at(m - 1))
        cum_income += gross
        # Вычет применяется, пока доход нарастающим итогом не превысил предел.
        ded_applied = ded_month if cum_income <= p.deduction_income_limit else Decimal("0")
        cum_deductions += ded_applied
        taxable_cum = cum_income - cum_deductions
        if taxable_cum < 0:
            taxable_cum = Decimal("0")
        ndfl_cum = ndfl_progressive(taxable_cum)
        ndfl_month = ndfl_cum - cum_ndfl_before
        if ndfl_month < 0:
            ndfl_month = Decimal("0")
        cum_ndfl = ndfl_cum
        net = money(gross - ndfl_month)

        # Разбивка на аванс/расчёт. Детский вычет применяется на этапе расчёта (как в 1С),
        # поэтому база НДФЛ с аванса = доход до месяца + аванс − вычеты до месяца.
        advance_gross = money(gross * advance_share)
        income_before = cum_income - gross
        ded_before = cum_deductions - ded_applied
        advance_base_cum = income_before + advance_gross - ded_before
        if advance_base_cum < 0:
            advance_base_cum = Decimal("0")
        advance_ndfl = ndfl_progressive(advance_base_cum) - cum_ndfl_before
        if advance_ndfl < 0:
            advance_ndfl = Decimal("0")
        if advance_ndfl > ndfl_month:
            advance_ndfl = ndfl_month
        advance_net = money(advance_gross - advance_ndfl)
        settlement_gross = money(gross - advance_gross)
        settlement_ndfl = ndfl_month - advance_ndfl
        settlement_net = money(settlement_gross - settlement_ndfl)

        # Страховые взносы
        if msp:
            under = min(gross, msp_threshold)
            over = gross - under
            if over < 0:
                over = Decimal("0")
            vznosy = under * p.vznosy_rate + over * p.msp_rate
        else:
            base_before = cum_base_vznosy
            base_after = cum_base_vznosy + gross
            at_30 = min(base_after, p.vznosy_limit_base) - min(base_before, p.vznosy_limit_base)
            if at_30 < 0:
                at_30 = Decimal("0")
            at_over = gross - at_30
            vznosy = at_30 * p.vznosy_rate + at_over * p.vznosy_rate_over
            cum_base_vznosy = base_after

        travmatizm = gross * travm_rate

        rows.append(
            SalaryMonth(
                month=m,
                gross=money(gross),
                deduction_applied=money(ded_applied),
                ndfl=money(ndfl_month),
                net=net,
                vznosy=money(vznosy),
                travmatizm=money(travmatizm),
                advance_gross=money(advance_gross),
                advance_ndfl=money(advance_ndfl),
                advance_net=advance_net,
                settlement_gross=money(settlement_gross),
                settlement_ndfl=money(settlement_ndfl),
                settlement_net=settlement_net,
            )
        )

    gross_year = money(sum((r.gross for r in rows), Decimal("0")))
    ndfl_year = money(sum((r.ndfl for r in rows), Decimal("0")))
    net_year = money(sum((r.net for r in rows), Decimal("0")))
    vznosy_year = money(sum((r.vznosy for r in rows), Decimal("0")))
    travm_year = money(sum((r.travmatizm for r in rows), Decimal("0")))
    advance_ndfl_year = money(sum((r.advance_ndfl for r in rows), Decimal("0")))
    settlement_ndfl_year = money(sum((r.settlement_ndfl for r in rows), Decimal("0")))

    return SalaryResult(
        year=year,
        monthly_gross=money(base_gross),
        msp=msp,
        months=rows,
        gross_year=gross_year,
        ndfl_year=ndfl_year,
        net_year=net_year,
        vznosy_year=vznosy_year,
        travmatizm_year=travm_year,
        employer_cost_year=money(gross_year + vznosy_year + travm_year),
        child_deduction_monthly=ded_month,
        advance_ndfl_year=advance_ndfl_year,
        settlement_ndfl_year=settlement_ndfl_year,
        notes=notes,
    )


# ---------- Отпускные ----------

@dataclass
class VacationResult:
    year: int
    avg_daily: Decimal       # среднедневной заработок (СДЗ)
    min_daily: Decimal       # минимальный СДЗ из МРОТ
    days: int
    gross: Decimal           # начислено отпускных
    ndfl: Decimal
    net: Decimal
    notes: list[str] = field(default_factory=list)


def calc_vacation(year: int, base_12m, vacation_days: int) -> VacationResult:
    """Отпускные: СДЗ = база за 12 мес ÷ 12 ÷ 29,3 (ст. 139 ТК РФ). НДФЛ упрощённо 13%."""
    if vacation_days < 0:
        raise ValueError("Число дней отпуска не может быть отрицательным")
    p = get_payroll(year)
    base = to_decimal(base_12m)
    avg_daily_raw = base / Decimal("12") / Decimal("29.3")
    min_daily = money(p.mrot / Decimal("29.3"))
    # Округляем среднедневной до копеек один раз, чтобы сумма = СДЗ × дни сходилась вручную.
    avg_daily = money(max(avg_daily_raw, min_daily))
    gross = money(avg_daily * vacation_days)
    ndfl = ndfl_progressive(gross)
    notes = ["НДФЛ с отпускных по прогрессивной шкале от суммы выплаты (без годовых вычетов) — сверить с бухгалтером."]
    return VacationResult(
        year=year,
        avg_daily=money(avg_daily),
        min_daily=money(min_daily),
        days=vacation_days,
        gross=gross,
        ndfl=money(ndfl),
        net=money(gross - ndfl),
        notes=notes,
    )


# ---------- Больничные ----------

@dataclass
class SickLeaveResult:
    year: int
    avg_daily_fact: Decimal
    min_daily: Decimal
    max_daily: Decimal
    avg_daily_used: Decimal
    stazh_coeff: Decimal
    daily_benefit: Decimal
    total: Decimal
    employer_part: Decimal    # первые дни за счёт работодателя
    sfr_part: Decimal         # за счёт СФР
    ndfl: Decimal
    net: Decimal
    notes: list[str] = field(default_factory=list)


def calc_sick_leave(
    year: int,
    earnings_prev1,
    earnings_prev2,
    stazh_years: float,
    sick_days: int,
    employer_days: int = 3,
    days_in_month: int = 31,
    day_floors=None,
) -> SickLeaveResult:
    """Больничный: СДЗ = (заработок за 2 пред. года, каждый ≤ предельной базы) ÷ 730,
    с учётом стажа и ограничений мин/макс. Первые `employer_days` дней — за счёт работодателя."""
    if sick_days < 0:
        raise ValueError("Число дней болезни не может быть отрицательным")
    p = get_payroll(year)
    y1, y2 = year - 1, year - 2
    cap1 = SICK_LEAVE_BASE_BY_YEAR.get(y1)
    cap2 = SICK_LEAVE_BASE_BY_YEAR.get(y2)
    e1 = to_decimal(earnings_prev1)
    e2 = to_decimal(earnings_prev2)
    notes: list[str] = []
    if cap1 is not None:
        e1 = min(e1, cap1)
    else:
        notes.append(f"Нет предельной базы за {y1} год — проверить ограничение.")
    if cap2 is not None:
        e2 = min(e2, cap2)
    else:
        notes.append(f"Нет предельной базы за {y2} год — проверить ограничение.")

    avg_daily_fact = (e1 + e2) / Decimal("730")
    min_daily = p.mrot * Decimal("24") / Decimal("730")
    max_cap1 = cap1 if cap1 is not None else p.vznosy_limit_base
    max_cap2 = cap2 if cap2 is not None else p.vznosy_limit_base
    max_daily = (max_cap1 + max_cap2) / Decimal("730")

    avg = max(avg_daily_fact, min_daily)
    avg = min(avg, max_daily)

    if stazh_years >= 8:
        coeff = Decimal("1.0")
    elif stazh_years >= 5:
        coeff = Decimal("0.8")
    else:
        coeff = Decimal("0.6")

    # Дневное пособие с учётом стажа, но не ниже МРОТ-пола (ст. 6.1 ФЗ № 255-ФЗ).
    # Пол = МРОТ / число календарных дней МЕСЯЦА; при переходе больничного через границу
    # месяца делитель у дней разный — считаем подённо (day_floors[i] = дней в месяце i-го дня).
    benefit_daily = avg * coeff

    def floor_for(i: int) -> Decimal:
        d = day_floors[i] if (day_floors and i < len(day_floors) and day_floors[i]) else days_in_month
        return p.mrot / Decimal(d)

    emp_days = min(employer_days, sick_days)
    total_raw = Decimal("0")
    employer_raw = Decimal("0")
    for i in range(sick_days):
        d = money(max(benefit_daily, floor_for(i)))
        total_raw += d
        if i < emp_days:
            employer_raw += d
    total = money(total_raw)
    employer_part = money(employer_raw)
    sfr_part = money(total - employer_part)
    # Представительное дневное пособие (по основному месяцу) — для отображения.
    daily_benefit = money(max(benefit_daily, p.mrot / Decimal(days_in_month)))
    ndfl = ndfl_progressive(total)

    return SickLeaveResult(
        year=year,
        avg_daily_fact=money(avg_daily_fact),
        min_daily=money(min_daily),
        max_daily=money(max_daily),
        avg_daily_used=money(avg),
        stazh_coeff=coeff,
        daily_benefit=daily_benefit,
        total=total,
        employer_part=employer_part,
        sfr_part=sfr_part,
        ndfl=money(ndfl),
        net=money(total - ndfl),
        notes=notes,
    )


# ---------- Алименты ----------

@dataclass
class AlimonyResult:
    salary_gross: Decimal
    ndfl: Decimal
    base_after_ndfl: Decimal
    share_label: str
    alimony: Decimal
    capped: bool              # упёрлись ли в максимум 70%
    notes: list[str] = field(default_factory=list)


_ALIMONY_SHARES = {1: Decimal("1") / 4, 2: Decimal("1") / 3, 3: Decimal("1") / 2}


def calc_alimony(salary_gross, ndfl, children: int) -> AlimonyResult:
    """Алименты: доля от (зарплата − НДФЛ). 1 ребёнок — 1/4, 2 — 1/3, 3+ — 1/2 (ст. 81 СК РФ).
    Максимум удержания на детей — 70% (ст. 99 ФЗ № 229-ФЗ)."""
    gross = to_decimal(salary_gross)
    ndfl_d = to_decimal(ndfl)
    base = gross - ndfl_d
    if base < 0:
        base = Decimal("0")
    if children <= 0:
        return AlimonyResult(
            salary_gross=money(gross),
            ndfl=money(ndfl_d),
            base_after_ndfl=money(base),
            share_label="0",
            alimony=Decimal("0"),
            capped=False,
            notes=["Нет детей на алименты — удержание не начисляется."],
        )
    n = min(children, 3)
    share = _ALIMONY_SHARES[n]
    label = {1: "1/4", 2: "1/3", 3: "1/2"}[n]
    raw = base * share
    cap = base * Decimal("0.70")
    capped = raw > cap
    alimony = cap if capped else raw
    notes = []
    if capped:
        notes.append("Применён максимум удержания 70% (ст. 99 ФЗ № 229-ФЗ).")
    return AlimonyResult(
        salary_gross=money(gross),
        ndfl=money(ndfl_d),
        base_after_ndfl=money(base),
        share_label=label,
        alimony=money(alimony),
        capped=capped,
        notes=notes,
    )
