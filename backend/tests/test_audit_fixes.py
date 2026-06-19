"""Паритет Python с TS по исправлениям аудита: НДС output_vat, отпускные с
кумулятивной базой, больничный с потолком МРОТ при стаже <6 мес."""
from decimal import Decimal

from taxcore import calc_sick_leave, calc_vacation, calc_vat_usn


def test_vat_output_separate_from_payable():
    r = calc_vat_usn(2025, 100_000_000, mode="general", input_vat=30_000_000)
    assert r.vat == Decimal("0")
    assert r.output_vat > Decimal("15000000")


def test_vat_output_equals_vat_for_special_rate():
    r = calc_vat_usn(2025, 100_000_000, mode="rate5")
    assert r.output_vat == r.vat


def test_vacation_cumulative_marginal_ndfl():
    lo = calc_vacation(2025, 1_200_000, 14, 0)
    hi = calc_vacation(2025, 1_200_000, 14, 2_400_000)
    assert hi.ndfl > lo.ndfl


def test_sick_under6m_cap():
    normal = calc_sick_leave(2025, 2_000_000, 2_000_000, 3, 10)
    capped = calc_sick_leave(2025, 2_000_000, 2_000_000, 3, 10, under6m_stazh=True)
    assert capped.total < normal.total
