"""Базовые типы и денежные утилиты для расчётов.

Деньги считаем в Decimal, чтобы не было ошибок округления float.
Налог УСН исчисляется в полных рублях (ст. 52 НК РФ), взносы — с копейками.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from enum import Enum

__all__ = ["UsnObject", "round_rub", "money", "to_decimal", "shift_to_workday"]

_RUBLE = Decimal("1")
_KOPECK = Decimal("0.01")


def to_decimal(value) -> Decimal:
    """Безопасное приведение к Decimal (через str, чтобы не тащить погрешность float).

    Бросает ValueError на мусорные входы (None, '', NaN, Inf, bool) — чтобы ошибка
    ввода не «протекла» молча в расчёт и не выдала неверную сумму налога.
    """
    if isinstance(value, bool):
        raise ValueError(f"Ожидалось число, получено булево значение: {value!r}")
    if value is None:
        raise ValueError("Ожидалось число, получено None")
    if isinstance(value, Decimal):
        d = value
    else:
        if isinstance(value, str) and value.strip() == "":
            raise ValueError("Ожидалось число, получена пустая строка")
        try:
            d = Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise ValueError(f"Не удалось преобразовать в число: {value!r}") from exc
    if not d.is_finite():
        raise ValueError(f"Денежная сумма должна быть конечной (не NaN/Inf): {value!r}")
    return d


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
