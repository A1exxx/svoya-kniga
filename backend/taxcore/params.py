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
    vat_exempt_threshold: Decimal        # НДС: порог освобождения (доход за год), ст. 145 НК РФ
    vat_rate5_limit: Decimal             # НДС: верхняя граница спец-ставки 5% (доход)
    vat_rate7_limit: Decimal             # НДС: верхняя граница 7% — выше = утрата УСН
    vat_general_rate: Decimal            # НДС: общая ставка, % (20% до 2026, 22% с 2026)
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
        vat_exempt_threshold=_D("60000000"),
        vat_rate5_limit=_D("250000000"),
        vat_rate7_limit=_D("450000000"),
        vat_general_rate=_D("20"),
        verified=True,
        note="Фикс 49 500 ₽ и потолок 1% = 277 571 ₽ — ст. 430 НК РФ. (НДС для УСН введён с 2025.)",
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
        vat_exempt_threshold=_D("60000000"),
        vat_rate5_limit=_D("250000000"),
        vat_rate7_limit=_D("450000000"),
        vat_general_rate=_D("20"),
        verified=True,
        note="Фикс 53 658 ₽ и потолок 1% = 300 888 ₽ — ст. 430 НК РФ. НДС для УСН: освобождение ≤60 млн, спец-ставки 5/7%, общая 20% (ФЗ № 176-ФЗ).",
    ),
    2026: YearParams(
        year=2026,
        fixed_contributions=_D("57390"),
        income_threshold_1pct=_D("300000"),
        rate_1pct=_D("0.01"),
        max_variable_contributions=_D("321818"),
        usn_income_rate=_D("0.06"),
        usn_income_minus_rate=_D("0.15"),
        usn_min_tax_rate=_D("0.01"),
        vat_exempt_threshold=_D("20000000"),
        vat_rate5_limit=_D("272500000"),
        vat_rate7_limit=_D("490500000"),
        vat_general_rate=_D("22"),
        verified=True,
        note=(
            "Фикс 57 390 ₽ и потолок 1% = 321 818 ₽ — ст. 430 НК РФ. Максимум «за себя» 2026 = "
            "379 208 ₽. НДС (ФЗ № 425-ФЗ от 28.11.2025): общая ставка 22%, порог освобождения "
            "снижен 60→20 млн ₽, спец-ставки 5% (20–272,5 млн) / 7% (272,5–490,5 млн, дефлятор "
            "1,090 — сверить)."
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
