"""ОСНО (общая система налогообложения) для ИП — базовый расчёт.

ИП на ОСНО платит:
  • НДФЛ по прогрессивной шкале (13/15/18/20/22%) с базы «доходы −
    профессиональный вычет» (ст. 210, 221, 224 НК РФ);
  • НДС с реализации по общей ставке (20% до 2026, 22% с 2026), если нет
    освобождения по ст. 145 НК РФ.

Профессиональный вычет (ст. 221 НК РФ): документально подтверждённые расходы
ИЛИ 20% от доходов, если расходы подтвердить нельзя. Берём более выгодный.

⚠️ Упрощённая модель для оценки. Полный учёт ОСНО (КУДиР, авансы по НДФЛ,
вычет входящего НДС по счёт-фактурам) — отдельный модуль. Корректность
подтверждает бухгалтер.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from .models import to_decimal
from .params import get_params
from .payroll import ndfl_progressive

__all__ = ["OsnoResult", "calc_osno_ip"]


@dataclass(frozen=True)
class OsnoResult:
    income: Decimal
    expenses: Decimal
    professional_deduction: Decimal
    used_20pct: bool
    ndfl_base: Decimal
    ndfl: Decimal
    vat_rate: Decimal
    vat_exempt: bool
    vat: Decimal
    total: Decimal


def calc_osno_ip(year: int, income, expenses=0, vat_exempt: bool = False) -> OsnoResult:
    """Базовый расчёт налогов ИП на ОСНО за год."""
    inc = to_decimal(income)
    exp = to_decimal(expenses)
    if inc < 0 or exp < 0:
        raise ValueError("Доходы и расходы не могут быть отрицательными")

    ded20 = inc * Decimal("0.20")
    used_20pct = exp < ded20
    professional_deduction = ded20 if used_20pct else exp

    ndfl_base = max(inc - professional_deduction, Decimal("0"))
    ndfl = ndfl_progressive(ndfl_base)

    vat_rate = get_params(year).vat_general_rate
    if vat_exempt:
        vat = Decimal("0")
    else:
        vat = (inc - inc / (Decimal("1") + vat_rate / Decimal("100"))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    total = ndfl + vat
    return OsnoResult(
        income=inc,
        expenses=exp,
        professional_deduction=professional_deduction,
        used_20pct=used_20pct,
        ndfl_base=ndfl_base,
        ndfl=ndfl,
        vat_rate=vat_rate,
        vat_exempt=vat_exempt,
        vat=vat,
        total=total,
    )
