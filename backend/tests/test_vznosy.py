"""Тесты страховых взносов ИП. Эталонные значения посчитаны вручную."""
from decimal import Decimal as D

import pytest

from taxcore import UsnObject, calc_contributions, get_params


def test_fixed_only_when_income_below_threshold():
    # Доход < 300 000 → только фиксированная часть, 1% = 0.
    r = calc_contributions(2025, income=200_000)
    assert r.fixed == 53658
    assert r.one_percent == 0
    assert r.total == 53658
    assert r.capped is False


def test_one_percent_basic_2025():
    # Доходы 1 000 000: 1% от (1 000 000 − 300 000) = 7 000.
    r = calc_contributions(2025, income=1_000_000)
    assert r.fixed == 53658
    assert r.income_over_threshold == 700_000
    assert r.one_percent == 7000
    assert r.total == 60658
    assert r.capped is False


def test_one_percent_capped_2025():
    # Очень большой доход → переменная часть упирается в потолок 300 888.
    r = calc_contributions(2025, income=50_000_000)
    assert r.capped is True
    assert r.one_percent == 300_888
    assert r.total == D("53658") + D("300888")


def test_income_minus_base_uses_expenses():
    # «Доходы минус расходы»: база 1% = доходы − расходы.
    r = calc_contributions(
        2025, income=2_000_000, expenses=1_500_000, usn_object=UsnObject.INCOME_MINUS
    )
    assert r.base_1pct == 500_000
    assert r.income_over_threshold == 200_000
    assert r.one_percent == 2000
    assert r.total == 55658


def test_due_dates_are_workdays():
    r = calc_contributions(2025, income=1_000_000)
    assert r.fixed_due.year == 2025 and r.fixed_due.month == 12
    assert r.fixed_due.weekday() < 5            # перенесён с выходного
    assert r.one_percent_due.year == 2026 and r.one_percent_due.month == 7
    assert r.one_percent_due.weekday() < 5


def test_2024_params():
    r = calc_contributions(2024, income=1_000_000)
    assert r.fixed == 49500
    assert r.one_percent == 7000  # (1 000 000 − 300 000) * 1%


def test_2026_params_verified_with_legal_basis():
    # 2026 параметры подтверждены (ст. 430 НК) → флаг verified, без предупреждения.
    p = get_params(2026)
    assert p.verified is True
    assert "430" in p.note
    assert p.fixed_contributions == 57390
    assert p.max_variable_contributions == 321818
    r = calc_contributions(2026, income=1_000_000)
    assert not any("не сверен" in n.lower() for n in r.notes)


def test_unknown_year_raises():
    with pytest.raises(KeyError):
        calc_contributions(2010, income=1_000_000)
