"""Страховые взносы ИП «за себя»: фиксированная часть + 1% с дохода свыше 300 000 ₽."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .models import UsnObject, money, shift_to_workday, to_decimal
from .params import get_params
from calendar import monthrange

__all__ = ["ContributionsResult", "calc_contributions"]


def _to_date(v):
    if v is None:
        return None
    if isinstance(v, date):
        return v
    try:
        y, m, d = str(v).split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _prorated_fixed(year, fixed_annual, reg_date=None, close_date=None):
    """Фиксированные взносы пропорционально дням деятельности в году (неполный год, ст. 430 НК)."""
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    rd = _to_date(reg_date)
    cd = _to_date(close_date)
    active_start = max(start, rd) if (rd and rd.year == year) else start
    active_end = min(end, cd) if (cd and cd.year == year) else end
    if active_start <= start and active_end >= end:
        return to_decimal(fixed_annual), False
    monthly = to_decimal(fixed_annual) / Decimal(12)
    total = Decimal(0)
    for m in range(1, 13):
        dim = monthrange(year, m)[1]
        ms = date(year, m, 1)
        me = date(year, m, dim)
        s = max(active_start, ms)
        e = min(active_end, me)
        if e >= s:
            active_days = (e - s).days + 1
            total += monthly * Decimal(active_days) / Decimal(dim)
    return total, True


@dataclass
class ContributionsResult:
    year: int
    fixed: Decimal                  # фиксированная часть
    base_1pct: Decimal              # база для 1% (доход или доходы−расходы)
    income_over_threshold: Decimal  # сумма свыше 300 000 ₽, с которой берётся 1%
    one_percent_uncapped: Decimal   # 1% до применения годового потолка
    one_percent: Decimal            # 1% с учётом потолка
    capped: bool                    # достигнут ли потолок переменной части
    total: Decimal                  # фикс + 1%
    fixed_due: date                 # срок уплаты фиксированной части
    one_percent_due: date           # срок уплаты 1%
    notes: list[str] = field(default_factory=list)


def calc_contributions(
    year: int,
    income,
    expenses=None,
    usn_object: UsnObject = UsnObject.INCOME,
    reg_date=None,
    close_date=None,
) -> ContributionsResult:
    """Взносы ИП «за себя» за год.

    База для 1%:
      • «Доходы»            → весь доход;
      • «Доходы минус расходы» → доходы − расходы (позиция в пользу налогоплательщика,
        подтверждена практикой КС РФ/письмами ФНС — но СВЕРИТЬ с бухгалтером).

    Сроки: фиксированная часть — до 28 декабря года; 1% — до 1 июля следующего года
    (с переносом с выходного; праздники проверять отдельно).
    """
    p = get_params(year)
    income = to_decimal(income)
    notes: list[str] = []

    if usn_object == UsnObject.INCOME_MINUS:
        exp = to_decimal(expenses or 0)
        base_1pct = income - exp
        notes.append(
            "База 1% взята как доходы − расходы. Исторически спорно — сверить с бухгалтером."
        )
    else:
        base_1pct = income

    over = base_1pct - p.income_threshold_1pct
    if over < 0:
        over = to_decimal(0)

    one_pct_uncapped = money(over * p.rate_1pct)
    capped = one_pct_uncapped > p.max_variable_contributions
    one_pct = p.max_variable_contributions if capped else one_pct_uncapped
    if capped:
        notes.append(f"Применён годовой потолок переменной части: {money(p.max_variable_contributions)} ₽.")
    if not p.verified:
        notes.append(f"Параметры {year} года не сверены (verified=False) — ОБЯЗАТЕЛЬНО проверить.")

    fixed_amount, prorated = _prorated_fixed(year, p.fixed_contributions, reg_date, close_date)
    if prorated:
        notes.append(
            "Фиксированные взносы уменьшены пропорционально периоду деятельности "
            "(неполный год, ст. 430 НК РФ)."
        )

    return ContributionsResult(
        year=year,
        fixed=money(fixed_amount),
        base_1pct=money(base_1pct),
        income_over_threshold=money(over),
        one_percent_uncapped=one_pct_uncapped,
        one_percent=money(one_pct),
        capped=capped,
        total=money(fixed_amount + one_pct),
        fixed_due=shift_to_workday(date(year, 12, 28)),
        one_percent_due=shift_to_workday(date(year + 1, 7, 1)),
        notes=notes,
    )
