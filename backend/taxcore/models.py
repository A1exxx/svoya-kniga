"""Базовые типы и денежные утилиты для расчётов.

Деньги считаем в Decimal, чтобы не было ошибок округления float.
Налог УСН исчисляется в полных рублях (ст. 52 НК РФ), взносы — с копейками.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

__all__ = ["UsnObject", "round_rub", "money", "to_decimal", "shift_to_workday"]

_RUBLE = Decimal("1")
_KOPECK = Decimal("0.01")


def to_decimal(value) -> Decimal:
    """Безопасное приведение к Decimal (через str, чтобы не тащить погрешность float)."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_rub(value) -> Decimal:
    """Округление до полного рубля (налог УСН — в полных рублях, ст. 52 НК РФ)."""
    return to_decimal(value).quantize(_RUBLE, rounding=ROUND_HALF_UP)


def money(value) -> Decimal:
    """Деньги до копейки (страховые взносы уплачиваются с копейками)."""
    return to_decimal(value).quantize(_KOPECK, rounding=ROUND_HALF_UP)


def shift_to_workday(d: date) -> date:
    """Перенос срока с выходного (Сб/Вс) на ближайший рабочий день.

    ВНИМАНИЕ: государственные праздники здесь НЕ учитываются. Перенос из-за
    праздников нужно проверять вручную/через производственный календарь.
    """
    while d.weekday() >= 5:  # 5 = суббота, 6 = воскресенье
        d += timedelta(days=1)
    return d


class UsnObject(str, Enum):
    """Объект налогообложения УСН."""

    INCOME = "income"              # «Доходы» (базовая ставка 6%)
    INCOME_MINUS = "income_minus"  # «Доходы минус расходы» (базовая ставка 15%)
