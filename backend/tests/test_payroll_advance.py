"""Тесты разбивки зарплаты на аванс и окончательный расчёт с отдельным НДФЛ.
Инвариант: ndfl == advance_ndfl + settlement_ndfl. Паритет с TS (payroll.advance.test.ts)."""
from decimal import Decimal as D

from taxcore import calc_salary


def test_advance_30_percent_of_100k():
    r = calc_salary(2026, 100_000, advance_percent=D("0.3"), months=1, msp=True)
    m = r.months[0]
    assert m.advance_gross == 30_000
    assert m.advance_ndfl == 3_900          # 13% от 30 000
    assert m.advance_net == 26_100
    assert m.settlement_gross == 70_000
    assert m.settlement_ndfl == 9_100
    assert m.settlement_net == 60_900
    # Инвариант
    assert m.advance_ndfl + m.settlement_ndfl == m.ndfl == 13_000
    assert m.advance_net + m.settlement_net == m.net


def test_advance_invariant_across_threshold():
    r = calc_salary(2026, 250_000, advance_percent=D("0.4"), months=12, msp=True)
    assert r.ndfl_year == 402_000           # годовой НДФЛ не изменился
    assert r.advance_ndfl_year + r.settlement_ndfl_year == r.ndfl_year
    for m in r.months:
        assert m.advance_ndfl + m.settlement_ndfl == m.ndfl
        assert m.advance_gross + m.settlement_gross == m.gross


def test_advance_zero_is_regression():
    r = calc_salary(2026, 100_000, advance_percent=D("0"), months=12, msp=True)
    for m in r.months:
        assert m.advance_gross == 0
        assert m.advance_ndfl == 0
        assert m.settlement_ndfl == m.ndfl
    # Без параметра — тоже пусто (дефолт)
    r2 = calc_salary(2026, 100_000, months=1)
    assert r2.months[0].advance_gross == 0
    assert r2.months[0].settlement_ndfl == r2.months[0].ndfl
