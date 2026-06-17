"""Тесты НДС для УСН (ФЗ № 176-ФЗ)."""
from decimal import Decimal

import pytest

from taxcore.vat import VAT_EXEMPT_THRESHOLD, calc_vat_usn


def test_exempt_below_threshold():
    r = calc_vat_usn(2026, 50_000_000)
    assert r.exempt is True
    assert r.obligated is False
    assert r.vat == Decimal("0")
    assert r.rate == Decimal("0")


def test_exempt_at_threshold_exactly():
    # Ровно 60 млн — ещё освобождение (порог «более 60 млн»).
    r = calc_vat_usn(2026, 60_000_000)
    assert r.exempt is True
    assert r.vat == Decimal("0")


def test_rate5_auto_income_with_vat():
    # 100 млн с НДС, авто → 5%. НДС = 100 000 000 × 5/105.
    r = calc_vat_usn(2026, 100_000_000, mode="auto", income_includes_vat=True)
    assert r.obligated is True
    assert r.rate == Decimal("5")
    assert r.mode == "rate5"
    assert r.vat == Decimal("4761905")  # 100M×5/105 = 4 761 904.76 → 4 761 905
    assert r.base == Decimal("95238095")
    assert r.input_vat_deducted == Decimal("0")


def test_rate5_income_without_vat():
    # 100 млн без НДС → НДС = 5% сверху = 5 000 000.
    r = calc_vat_usn(2026, 100_000_000, mode="auto", income_includes_vat=False)
    assert r.rate == Decimal("5")
    assert r.vat == Decimal("5000000")
    assert r.base == Decimal("100000000")


def test_rate7_auto_above_250():
    # 300 млн → авто 7%.
    r = calc_vat_usn(2026, 300_000_000, mode="auto", income_includes_vat=True)
    assert r.rate == Decimal("7")
    assert r.mode == "rate7"
    # 300M × 7/107 = 19 626 168.22 → 19 626 168
    assert r.vat == Decimal("19626168")


def test_general20_with_input_vat():
    # 100 млн с НДС, общая 20%, входящий 5 млн.
    r = calc_vat_usn(
        2026, 100_000_000, mode="general20", income_includes_vat=True, input_vat=5_000_000
    )
    assert r.rate == Decimal("20")
    # исходящий = 100M×20/120 = 16 666 666.67; минус вычет 5M = 11 666 667
    assert r.vat == Decimal("11666667")
    assert r.input_vat_deducted == Decimal("5000000")


def test_general20_input_exceeds_output_clamped_zero():
    r = calc_vat_usn(
        2026, 70_000_000, mode="general20", income_includes_vat=True, input_vat=50_000_000
    )
    assert r.vat == Decimal("0")  # вычет больше исходящего → 0, не отрицательное


def test_prior_year_triggers_obligation():
    # Текущий доход мал, но прошлый превысил 60 млн → НДС обязателен.
    r = calc_vat_usn(2026, 40_000_000, prior_year_income=80_000_000, mode="auto")
    assert r.obligated is True
    assert r.rate == Decimal("5")


def test_mode_none_forces_exempt():
    r = calc_vat_usn(2026, 100_000_000, mode="none")
    assert r.vat == Decimal("0")
    assert r.mode == "none"


def test_negative_income_raises():
    with pytest.raises(ValueError):
        calc_vat_usn(2026, -1)


def test_threshold_constant():
    assert VAT_EXEMPT_THRESHOLD == Decimal("60000000")
