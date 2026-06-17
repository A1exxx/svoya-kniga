"""Тесты проративности фиксированных взносов по дате регистрации ИП."""
from decimal import Decimal

from taxcore.vznosy import calc_contributions


def test_full_year_no_proration():
    r = calc_contributions(2026, 1_000_000)
    assert r.fixed == Decimal("57390.00")


def test_registered_mid_year_half():
    # Регистрация 1 июля → 6 полных месяцев (июль–декабрь) → 57 390 × 6/12 = 28 695.
    r = calc_contributions(2026, 1_000_000, reg_date="2026-07-01")
    assert r.fixed == Decimal("28695.00")
    # 1% НЕ пропорционируется: (1 000 000 − 300 000) × 1% = 7 000.
    assert r.one_percent == Decimal("7000.00")
    assert r.total == Decimal("35695.00")


def test_reg_date_prior_year_is_full():
    # Зарегистрирован в прошлом году → полный год, проративности нет.
    r = calc_contributions(2026, 500_000, reg_date="2024-03-01")
    assert r.fixed == Decimal("57390.00")


def test_closed_mid_year():
    # Закрытие 30 июня → 6 полных месяцев (январь–июнь) → 28 695.
    r = calc_contributions(2026, 1_000_000, close_date="2026-06-30")
    assert r.fixed == Decimal("28695.00")
