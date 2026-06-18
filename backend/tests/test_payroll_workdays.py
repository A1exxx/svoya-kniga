"""Тесты помесячной зарплаты по рабочим дням (month_factors).
Полный месяц → полный оклад; неполный → пропорционально. Паритет с TS
(payroll.workdays.test.ts). НДФЛ остаётся нарастающим итогом."""
from decimal import Decimal as D

from taxcore import calc_salary


def test_month_factors_full_equals_baseline():
    base = calc_salary(2026, 30_000, months=12, msp=True)
    r = calc_salary(2026, 30_000, months=12, msp=True, month_factors=[1] * 12)
    assert r.gross_year == base.gross_year
    assert r.ndfl_year == base.ndfl_year


def test_full_month_june_baseline():
    base = calc_salary(2026, 30_000, months=12, msp=True)
    m = base.months[5]
    assert m.gross == 30_000
    assert m.ndfl == 3_900          # 13% от 30 000, без вычетов
    assert m.net == 26_100


def test_month_factors_half_june():
    base = calc_salary(2026, 30_000, months=12, msp=True)
    f = [1] * 12
    f[5] = D("0.5")
    r = calc_salary(2026, 30_000, months=12, msp=True, month_factors=f)
    m = r.months[5]
    assert m.gross == 15_000
    assert m.ndfl == 1_950
    assert m.net == 13_050
    assert r.gross_year == base.gross_year - 15_000
