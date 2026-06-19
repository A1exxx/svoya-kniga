"""Тесты базового расчёта ОСНО для ИП. Паритет с osno.test.ts.

НДФЛ — прогрессивная шкала (13% до 2.4 млн); проф.вычет = max(расходы, 20%);
НДС — общая ставка года (20% до 2026, 22% с 2026), в т.ч. в выручке.
"""
from decimal import Decimal

import pytest

from taxcore.osno import calc_osno_ip


def test_deduction_20pct_when_no_expenses():
    r = calc_osno_ip(2026, 3_000_000, 0)
    assert r.used_20pct is True
    assert r.professional_deduction == Decimal("600000")
    assert r.ndfl_base == Decimal("2400000")
    assert r.ndfl == Decimal("312000")
    assert r.vat_rate == Decimal("22")
    # 3 000 000 − 3 000 000/1.22 = 540 983.61
    assert r.vat == Decimal("540983.61")
    assert r.total == Decimal("852983.61")


def test_documented_expenses():
    r = calc_osno_ip(2026, 3_000_000, 1_000_000)
    assert r.used_20pct is False
    assert r.professional_deduction == Decimal("1000000")
    assert r.ndfl_base == Decimal("2000000")
    assert r.ndfl == Decimal("260000")


def test_expenses_below_20pct_uses_20pct():
    r = calc_osno_ip(2026, 1_000_000, 100_000)
    assert r.used_20pct is True
    assert r.professional_deduction == Decimal("200000")


def test_vat_exempt():
    r = calc_osno_ip(2026, 1_000_000, 0, vat_exempt=True)
    assert r.vat == Decimal("0")
    assert r.ndfl_base == Decimal("800000")
    assert r.ndfl == Decimal("104000")


def test_vat_2025_general_20():
    r = calc_osno_ip(2025, 1_220_000, 0)
    assert r.vat_rate == Decimal("20")
    # 1 220 000 − 1 220 000/1.20 = 203 333.33
    assert r.vat == Decimal("203333.33")


def test_negative_income_raises():
    with pytest.raises(ValueError):
        calc_osno_ip(2026, -1, 0)
