"""Тесты зарплатных калькуляторов. Эталонные значения посчитаны вручную."""
from decimal import Decimal as D

import pytest

from taxcore import (
    calc_alimony,
    calc_salary,
    calc_sick_leave,
    calc_vacation,
    child_deduction_monthly,
    get_payroll,
    ndfl_progressive,
)


# --- НДФЛ прогрессия ------------------------------------------------------

def test_ndfl_tiers():
    assert ndfl_progressive(2_000_000) == 260_000        # 13%
    assert ndfl_progressive(2_400_000) == 312_000        # граница 1-й ступени
    assert ndfl_progressive(3_000_000) == 402_000        # 312000 + 600000*15%
    assert ndfl_progressive(5_000_000) == 702_000        # граница 2-й ступени
    assert ndfl_progressive(6_000_000) == 882_000        # 702000 + 1млн*18%
    assert ndfl_progressive(0) == 0
    assert ndfl_progressive(-100) == 0


# --- Детские вычеты -------------------------------------------------------

def test_child_deductions_2025():
    assert child_deduction_monthly(2025, children=1) == 1400
    assert child_deduction_monthly(2025, children=2) == 4200      # 1400 + 2800
    assert child_deduction_monthly(2025, children=3) == 10200     # + 6000
    assert child_deduction_monthly(2025, children=1, disabled_children=1) == 13400  # 1400 + 12000
    assert child_deduction_monthly(2025, children=2, single_parent=True) == 8400    # 4200 * 2


# --- Зарплата -------------------------------------------------------------

def test_salary_basic_msp_no_children():
    r = calc_salary(2025, 100_000, msp=True)
    m0 = r.months[0]
    assert m0.gross == 100_000
    assert m0.ndfl == 13_000          # 13% (доход за год < 2.4 млн)
    assert m0.net == 87_000
    # Взносы МСП: 1.5*МРОТ=33660 → 33660*30% + 66340*15%
    assert m0.vznosy == D("20049")    # 10098 + 9951
    assert m0.travmatizm == 200       # 0.2%
    assert r.ndfl_year == 156_000     # 13000 * 12
    assert r.gross_year == 1_200_000
    assert r.employer_cost_year == D("1442988")  # 1200000 + 240588 + 2400


def test_salary_progressive_crosses_threshold():
    # Оклад 250к → за год 3 млн, пересекает порог 2.4 млн.
    r = calc_salary(2025, 250_000, msp=True)
    assert r.ndfl_year == 402_000     # = ndfl_progressive(3 000 000)


def test_salary_child_deduction_until_limit():
    # Оклад 50к, 1 ребёнок: вычет 1400 действует, пока доход ≤ 450 000 (9 месяцев).
    r = calc_salary(2025, 50_000, children=1, msp=True)
    assert r.months[0].deduction_applied == 1400   # январь
    assert r.months[8].deduction_applied == 1400   # сентябрь (накопл. 450 000)
    assert r.months[9].deduction_applied == 0       # октябрь (накопл. 500 000 > 450 000)
    assert r.ndfl_year == 76_362                    # (600000 - 12600) * 13%


def test_salary_non_msp_uses_full_rate():
    r = calc_salary(2025, 100_000, msp=False)
    # Без МСП весь оклад в пределах базы облагается 30%.
    assert r.months[0].vznosy == 30_000


# --- Отпускные ------------------------------------------------------------

def test_vacation_basic():
    r = calc_vacation(2025, base_12m=600_000, vacation_days=14)
    assert r.avg_daily == D("1706.48")   # 600000/12/29.3
    assert r.gross == D("23890.78")
    assert r.ndfl == 3106
    assert r.net == D("20784.78")


def test_vacation_min_daily_floor():
    # Очень низкая база → используется минимальный СДЗ из МРОТ.
    r = calc_vacation(2025, base_12m=100_000, vacation_days=10)
    assert r.avg_daily == r.min_daily    # сработал пол по МРОТ
    assert r.min_daily == D("765.87")    # 22440/29.3


# --- Больничные -----------------------------------------------------------

def test_sick_leave_basic():
    r = calc_sick_leave(2025, earnings_prev1=600_000, earnings_prev2=550_000,
                        stazh_years=6, sick_days=10, employer_days=3)
    assert r.stazh_coeff == D("0.8")     # стаж 5–8 лет
    assert r.daily_benefit == D("1260.27")
    assert r.total == D("12602.70")
    assert r.employer_part == D("3780.81")   # 3 дня
    assert r.sfr_part == D("8821.89")


def test_sick_leave_max_cap_2025():
    r = calc_sick_leave(2025, earnings_prev1=9_000_000, earnings_prev2=9_000_000,
                        stazh_years=10, sick_days=1)
    # Заработок ограничен предельными базами 2024+2023 → макс. СДЗ.
    assert r.max_daily == D("5673.97")   # (2225000+1917000)/730
    assert r.avg_daily_used == r.max_daily
    assert r.stazh_coeff == D("1.0")


# --- Алименты -------------------------------------------------------------

def test_alimony_one_child():
    r = calc_alimony(salary_gross=100_000, ndfl=13_000, children=1)
    assert r.base_after_ndfl == 87_000
    assert r.share_label == "1/4"
    assert r.alimony == D("21750")        # 87000 / 4
    assert r.capped is False


def test_alimony_three_children():
    r = calc_alimony(salary_gross=100_000, ndfl=13_000, children=3)
    assert r.share_label == "1/2"
    assert r.alimony == D("43500")        # 87000 / 2


def test_payroll_params_verified():
    assert get_payroll(2025).mrot == 22_440
    assert get_payroll(2026).mrot == 27_093
    assert get_payroll(2025).vznosy_limit_base == 2_759_000
    assert get_payroll(2026).vznosy_limit_base == 2_979_000


def test_unknown_payroll_year_raises():
    with pytest.raises(KeyError):
        get_payroll(2010)
