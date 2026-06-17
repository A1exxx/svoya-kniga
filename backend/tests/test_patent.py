"""Тесты патента (ПСН)."""
from decimal import Decimal

import pytest

from taxcore.patent import calc_patent


def test_full_year_no_deduction():
    r = calc_patent(2026, 1_200_000, 12)
    assert r.cost_before_deduction == Decimal("72000")  # 1.2М × 6%
    assert r.cost == Decimal("72000")
    assert len(r.schedule) == 2  # 12 мес → две части


def test_half_year():
    r = calc_patent(2026, 1_200_000, 6)
    assert r.base == Decimal("600000")
    assert r.cost == Decimal("36000")  # 600к × 6%
    assert len(r.schedule) == 1  # ≤6 мес → одна оплата


def test_deduction_no_employees():
    r = calc_patent(2026, 1_200_000, 12, contributions_to_deduct=50_000)
    assert r.cost == Decimal("22000")  # 72000 − 50000


def test_deduction_capped_50pct_with_employees():
    r = calc_patent(2026, 1_200_000, 12, contributions_to_deduct=50_000, has_employees=True)
    # потолок 50% от 72000 = 36000 → к уплате 36000
    assert r.deduction == Decimal("36000")
    assert r.cost == Decimal("36000")


def test_schedule_split_two_thirds():
    r = calc_patent(2026, 1_200_000, 12)
    first, second = r.schedule[0][1], r.schedule[1][1]
    assert first == Decimal("24000")  # 72000 / 3
    assert second == Decimal("48000")
    assert first + second == r.cost


def test_invalid_months():
    with pytest.raises(ValueError):
        calc_patent(2026, 1_000_000, 13)
