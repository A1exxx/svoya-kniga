"""Калькулятор УСН: «Доходы» (6%) и «Доходы минус расходы» (15%).

Считает налог нарастающим итогом по отчётным периодам (1 кв., полугодие, 9 мес., год),
авансовые платежи к уплате за каждый период, минимальный налог (для «доходы−расходы»)
и доплату за год.

Нюансы, которые НУЖНО держать в голове (помечаются в notes):
  • «Доходы»: налог уменьшается на страховые взносы. ИП без работников — до 100%
    (вплоть до 0); ИП с работниками — не более 50%. С 2023 фикс. взносы можно учитывать
    в периоде, на который они приходятся по сроку, даже если ещё не уплачены — здесь мы
    принимаем уже подготовленную сумму взносов к вычету (caller считает её сам).
  • «Доходы минус расходы»: взносы НЕ уменьшают налог напрямую — они входят в расходы.
    По итогам года платится не меньше минимального налога (1% от доходов).
  • Региональные пониженные ставки и торговый сбор (Москва) — передаются параметром/не
    учитываются; проверить отдельно.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .models import UsnObject, round_rub, to_decimal
from .params import get_params

__all__ = ["PeriodData", "PeriodResult", "UsnYearResult", "calc_usn", "usn_quick"]


@dataclass
class PeriodData:
    """Входные данные нарастающим итогом на конец отчётного периода."""

    label: str                                          # «1 квартал» / «полугодие» / «9 месяцев» / «год»
    income_cumulative: Decimal                          # доходы нарастающим итогом
    expenses_cumulative: Decimal = Decimal("0")         # расходы нарастающим итогом (для «доходы−расходы»)
    contributions_to_deduct_cumulative: Decimal = Decimal("0")  # взносы к вычету (для «доходы»), наращ. итогом


@dataclass
class PeriodResult:
    label: str
    tax_base_cumulative: Decimal             # налоговая база нарастающим итогом
    tax_before_deduction_cumulative: Decimal # налог до вычета взносов
    deduction_cumulative: Decimal            # принятые к вычету взносы (для «доходы»)
    tax_cumulative: Decimal                  # налог нарастающим итогом (с учётом вычета/мин. налога)
    advance_due_this_period: Decimal         # к уплате за этот период (за вычетом ранее уплаченного)
    notes: list[str] = field(default_factory=list)


@dataclass
class UsnYearResult:
    usn_object: UsnObject
    rate: Decimal
    periods: list[PeriodResult]
    tax_year_computed: Decimal      # расчётный налог за год (до сравнения с минимальным)
    min_tax: Decimal                # минимальный налог (только для «доходы−расходы», иначе 0)
    tax_year_final: Decimal         # итоговый налог за год
    advances_paid_total: Decimal    # сумма авансов за периоды до годового (Q1+полугодие+9мес)
    year_payment_due: Decimal       # к доплате за год
    notes: list[str] = field(default_factory=list)


def calc_usn(
    year: int,
    usn_object: UsnObject,
    periods: list[PeriodData],
    has_employees: bool = False,
    rate: Decimal | None = None,
) -> UsnYearResult:
    if not periods:
        raise ValueError("Передайте хотя бы один отчётный период (PeriodData).")

    p = get_params(year)
    if usn_object == UsnObject.INCOME:
        eff_rate = to_decimal(rate) if rate is not None else p.usn_income_rate
    else:
        eff_rate = to_decimal(rate) if rate is not None else p.usn_income_minus_rate

    notes: list[str] = []
    if not p.verified:
        notes.append(f"Параметры {year} года не сверены (verified=False) — проверить.")

    n = len(periods)
    income_year = to_decimal(periods[-1].income_cumulative)
    min_tax = (
        round_rub(income_year * p.usn_min_tax_rate)
        if usn_object == UsnObject.INCOME_MINUS
        else Decimal("0")
    )

    results: list[PeriodResult] = []
    prev_payments = Decimal("0")

    for i, pd in enumerate(periods):
        is_last = i == n - 1
        income_cum = to_decimal(pd.income_cumulative)
        period_notes: list[str] = []

        if usn_object == UsnObject.INCOME:
            base = income_cum
            tax_before = round_rub(base * eff_rate)
            ded_avail = to_decimal(pd.contributions_to_deduct_cumulative)
            if has_employees:
                max_ded = round_rub(tax_before * Decimal("0.5"))
                applied = min(ded_avail, max_ded)
                if ded_avail > max_ded:
                    period_notes.append("Вычет ограничен 50% (есть работники).")
            else:
                applied = min(ded_avail, tax_before)
            tax_after = tax_before - applied
            if tax_after < 0:
                tax_after = Decimal("0")
        else:
            exp_cum = to_decimal(pd.expenses_cumulative)
            base = income_cum - exp_cum
            if base < 0:
                base = Decimal("0")
            tax_before = round_rub(base * eff_rate)
            applied = Decimal("0")
            tax_after = tax_before

        # Минимальный налог применяется только по итогам года (последний период).
        tax_effective = tax_after
        if is_last and usn_object == UsnObject.INCOME_MINUS and min_tax > tax_after:
            tax_effective = min_tax
            period_notes.append(
                f"Применён минимальный налог 1% = {min_tax} ₽ (больше расчётного {tax_after} ₽)."
            )

        advance = tax_effective - prev_payments
        if advance < 0:
            advance = Decimal("0")  # переплата — к уменьшению, не к доплате

        results.append(
            PeriodResult(
                label=pd.label,
                tax_base_cumulative=round_rub(base),
                tax_before_deduction_cumulative=tax_before,
                deduction_cumulative=applied,
                tax_cumulative=tax_effective,
                advance_due_this_period=advance,
                notes=period_notes,
            )
        )
        prev_payments += advance

    last = results[-1]
    tax_year_computed = last.tax_before_deduction_cumulative - last.deduction_cumulative
    if tax_year_computed < 0:
        tax_year_computed = Decimal("0")

    return UsnYearResult(
        usn_object=usn_object,
        rate=eff_rate,
        periods=results,
        tax_year_computed=tax_year_computed,
        min_tax=min_tax,
        tax_year_final=last.tax_cumulative,
        advances_paid_total=sum((r.advance_due_this_period for r in results[:-1]), Decimal("0")),
        year_payment_due=last.advance_due_this_period,
        notes=notes,
    )


def usn_quick(
    year: int,
    usn_object: UsnObject,
    income,
    expenses=0,
    contributions_to_deduct=0,
    has_employees: bool = False,
    rate: Decimal | None = None,
) -> UsnYearResult:
    """Упрощённый годовой расчёт (один период «год») — для простого экрана-калькулятора."""
    period = PeriodData(
        label="год",
        income_cumulative=to_decimal(income),
        expenses_cumulative=to_decimal(expenses),
        contributions_to_deduct_cumulative=to_decimal(contributions_to_deduct),
    )
    return calc_usn(year, usn_object, [period], has_employees=has_employees, rate=rate)
