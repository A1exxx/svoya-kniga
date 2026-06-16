"""Страховые взносы ИП «за себя»: фиксированная часть + 1% с дохода свыше 300 000 ₽."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .models import UsnObject, money, shift_to_workday, to_decimal
from .params import get_params

__all__ = ["ContributionsResult", "calc_contributions"]


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

    return ContributionsResult(
        year=year,
        fixed=money(p.fixed_contributions),
        base_1pct=money(base_1pct),
        income_over_threshold=money(over),
        one_percent_uncapped=one_pct_uncapped,
        one_percent=money(one_pct),
        capped=capped,
        total=money(p.fixed_contributions + one_pct),
        fixed_due=shift_to_workday(date(year, 12, 28)),
        one_percent_due=shift_to_workday(date(year + 1, 7, 1)),
        notes=notes,
    )
