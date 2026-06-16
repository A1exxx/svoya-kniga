"""Параметры налогов по годам.

ВАЖНО: эти значения меняются КАЖДЫЙ год и подлежат проверке бухгалтером.
Здесь — «эталонный» seed; в продукте они будут редактироваться через UI
(«Настройки → параметры налогов по годам») и храниться в БД с версией по году.

Значения со статусом verified=False (особенно 2026) ОБЯЗАТЕЛЬНО сверить
с официальным источником перед использованием в реальной сдаче.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .models import to_decimal

__all__ = ["YearParams", "YEARS", "DEFAULT_YEAR", "get_params"]


@dataclass(frozen=True)
class YearParams:
    year: int
    fixed_contributions: Decimal         # фикс. страховые взносы ИП «за себя» (за год)
    income_threshold_1pct: Decimal       # порог дохода для 1% (300 000 ₽)
    rate_1pct: Decimal                   # ставка переменной части (0.01)
    max_variable_contributions: Decimal  # годовой потолок переменной части (1%)
    usn_income_rate: Decimal             # базовая ставка «Доходы» (регион может снизить)
    usn_income_minus_rate: Decimal       # базовая ставка «Доходы минус расходы»
    usn_min_tax_rate: Decimal            # ставка минимального налога (1% от доходов)
    verified: bool                       # сверено с официальным источником/бухгалтером
    note: str = ""


_D = to_decimal

YEARS: dict[int, YearParams] = {
    2024: YearParams(
        year=2024,
        fixed_contributions=_D("49500"),
        income_threshold_1pct=_D("300000"),
        rate_1pct=_D("0.01"),
        max_variable_contributions=_D("277571"),
        usn_income_rate=_D("0.06"),
        usn_income_minus_rate=_D("0.15"),
        usn_min_tax_rate=_D("0.01"),
        verified=True,
        note="Фикс 49 500 ₽ и потолок 1% = 277 571 ₽ — ст. 430 НК РФ.",
    ),
    2025: YearParams(
        year=2025,
        fixed_contributions=_D("53658"),
        income_threshold_1pct=_D("300000"),
        rate_1pct=_D("0.01"),
        max_variable_contributions=_D("300888"),
        usn_income_rate=_D("0.06"),
        usn_income_minus_rate=_D("0.15"),
        usn_min_tax_rate=_D("0.01"),
        verified=True,
        note="Фикс 53 658 ₽ и потолок 1% = 300 888 ₽ — ст. 430 НК РФ.",
    ),
    2026: YearParams(
        year=2026,
        fixed_contributions=_D("57390"),
        income_threshold_1pct=_D("300000"),
        rate_1pct=_D("0.01"),
        max_variable_contributions=_D("321818"),  # ПРОВЕРИТЬ — ориентир, уточняется
        usn_income_rate=_D("0.06"),
        usn_income_minus_rate=_D("0.15"),
        usn_min_tax_rate=_D("0.01"),
        verified=False,
        note=(
            "Фикс 57 390 ₽ установлен ст. 430 НК РФ. Потолок 1% (321 818 ₽) — ОРИЕНТИР, "
            "ПРОВЕРИТЬ. Учесть реформу УСН 2025+: НДС на УСН при превышении порога дохода "
            "(отдельный модуль)."
        ),
    ),
}

DEFAULT_YEAR = 2026


def get_params(year: int) -> YearParams:
    if year in YEARS:
        return YEARS[year]
    raise KeyError(
        f"Нет параметров налогов за {year} год. Добавьте их в taxcore/params.py "
        f"(в продукте — через «Настройки → параметры по годам»). Известные годы: {sorted(YEARS)}."
    )
