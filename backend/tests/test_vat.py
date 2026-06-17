"""Тесты НДС для УСН. Пороги/общая ставка зависят от года:
2025 — освобождение ≤60 млн, общая 20% (ФЗ № 176-ФЗ);
2026 — освобождение ≤20 млн, общая 22% (ФЗ № 425-ФЗ). Паритет с vat.test.ts."""
from decimal import Decimal

import pytest

from taxcore.vat import VAT_EXEMPT_THRESHOLD, calc_vat_usn
from taxcore.params import get_params


def test_year_params():
    assert get_params(2025).vat_exempt_threshold == Decimal("60000000")
    assert get_params(2025).vat_general_rate == Decimal("20")
    assert get_params(2026).vat_exempt_threshold == Decimal("20000000")
    assert get_params(2026).vat_general_rate == Decimal("22")


def test_exempt_below_threshold_2025():
    r = calc_vat_usn(2025, 50_000_000)
    assert r.exempt is True
    assert r.obligated is False
    assert r.vat == Decimal("0")


def test_exempt_at_threshold_2025():
    assert calc_vat_usn(2025, 60_000_000).exempt is True


def test_2026_threshold_lowered_to_20m():
    assert calc_vat_usn(2026, 15_000_000).exempt is True
    r = calc_vat_usn(2026, 25_000_000, mode="auto")
    assert r.exempt is False
    assert r.rate == Decimal("5")


def test_rate5_auto_income_with_vat():
    r = calc_vat_usn(2026, 100_000_000, mode="auto", income_includes_vat=True)
    assert r.rate == Decimal("5")
    assert r.mode == "rate5"
    assert r.vat == Decimal("4761905")
    assert r.base == Decimal("95238095")


def test_rate5_income_without_vat():
    r = calc_vat_usn(2026, 100_000_000, mode="auto", income_includes_vat=False)
    assert r.rate == Decimal("5")
    assert r.vat == Decimal("5000000")


def test_rate7_auto_above_band():
    r = calc_vat_usn(2026, 300_000_000, mode="auto", income_includes_vat=True)
    assert r.rate == Decimal("7")
    assert r.mode == "rate7"


def test_general_2025_is_20_with_input_vat():
    r = calc_vat_usn(2025, 100_000_000, mode="general", income_includes_vat=True, input_vat=5_000_000)
    assert r.rate == Decimal("20")
    assert r.vat == Decimal("11666667")
    assert r.input_vat_deducted == Decimal("5000000")


def test_general_2026_is_22():
    r = calc_vat_usn(2026, 100_000_000, mode="general", income_includes_vat=True)
    assert r.rate == Decimal("22")
    assert r.base == Decimal("81967213")
    assert r.vat == Decimal("18032787")


def test_general20_alias_uses_year_rate():
    assert calc_vat_usn(2026, 100_000_000, mode="general20").rate == Decimal("22")


def test_rate10_with_deduction():
    r = calc_vat_usn(2026, 110_000_000, mode="rate10", income_includes_vat=True)
    assert r.rate == Decimal("10")
    assert r.vat == Decimal("10000000")


def test_general_input_exceeds_output_clamped_zero():
    r = calc_vat_usn(2025, 70_000_000, mode="general", income_includes_vat=True, input_vat=50_000_000)
    assert r.vat == Decimal("0")


def test_prior_year_triggers_obligation():
    r = calc_vat_usn(2025, 40_000_000, prior_year_income=80_000_000, mode="auto")
    assert r.obligated is True
    assert r.rate == Decimal("5")


def test_mode_none_forces_exempt():
    r = calc_vat_usn(2026, 100_000_000, mode="none")
    assert r.vat == Decimal("0")
    assert r.mode == "none"


def test_negative_income_raises():
    with pytest.raises(ValueError):
        calc_vat_usn(2026, -1)


def test_threshold_constant_legacy():
    assert VAT_EXEMPT_THRESHOLD == Decimal("60000000")


def test_above_usn_limit_blocks_special_rate():
    r = calc_vat_usn(2025, 500_000_000, mode="auto")
    assert r.mode == "usn_lost"
    assert r.vat == Decimal("0")


def test_manual_rate5_below_threshold_is_exempt():
    r = calc_vat_usn(2025, 50_000_000, mode="rate5")
    assert r.exempt is True


def test_manual_rate5_at_300m_uses_legal_rate7():
    r = calc_vat_usn(2026, 300_000_000, mode="rate5", income_includes_vat=True)
    assert r.rate == Decimal("7")
