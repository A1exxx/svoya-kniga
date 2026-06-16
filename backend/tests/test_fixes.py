"""Тесты под исправленные баги (по результатам состязательной проверки)."""
from decimal import Decimal as D

import pytest

from taxcore import (
    PeriodData,
    UsnObject,
    calc_usn,
    round_rub,
    to_decimal,
    usn_calendar,
    usn_quick,
)


# --- Переплата авансов (баг #1/#2): взносы уплачены в Q4 -------------------

def test_overpayment_when_contributions_paid_in_q4():
    periods = [
        PeriodData("1 квартал", 400_000, contributions_to_deduct_cumulative=0),
        PeriodData("полугодие", 800_000, contributions_to_deduct_cumulative=0),
        PeriodData("9 месяцев", 1_200_000, contributions_to_deduct_cumulative=0),
        PeriodData("год", 1_500_000, contributions_to_deduct_cumulative=53_658),
    ]
    r = calc_usn(2025, UsnObject.INCOME, periods)
    assert r.advances_paid_total == 72_000
    assert r.year_payment_due == 0
    assert r.tax_year_final == 36_342
    assert r.year_overpayment == 35_658
    assert any("переплат" in n.lower() for n in r.notes)


def test_no_overpayment_when_monotonic():
    periods = [
        PeriodData("1 квартал", 300_000, contributions_to_deduct_cumulative=13_415),
        PeriodData("полугодие", 600_000, contributions_to_deduct_cumulative=26_830),
        PeriodData("9 месяцев", 900_000, contributions_to_deduct_cumulative=40_245),
        PeriodData("год", 1_200_000, contributions_to_deduct_cumulative=53_658),
    ]
    r = calc_usn(2025, UsnObject.INCOME, periods)
    assert r.year_overpayment == 0
    # инвариант: начислено = годовой налог, когда переплаты нет
    assert r.advances_paid_total + r.year_payment_due == r.tax_year_final


# --- Календарь не задваивает годовой налог (баг #3/#4/#5) ------------------

def test_calendar_no_double_count_with_quick():
    usn = usn_quick(2025, UsnObject.INCOME, 1_000_000, contributions_to_deduct=0)
    events = usn_calendar(2025, usn=usn)
    q1 = next(e for e in events if e.title == "Аванс по УСН за 1 квартал")
    assert q1.amount is None  # годовой расчёт не подставляет годовой налог в Q1
    usn_payments = [
        e.amount for e in events
        if e.kind == "payment" and "УСН" in e.title and e.amount is not None
    ]
    assert sum(usn_payments, D("0")) == usn.tax_year_final  # 60 000, не 120 000


def test_calendar_notification_q1_not_year_tax():
    usn = usn_quick(2025, UsnObject.INCOME, 1_234_567, contributions_to_deduct=0)
    events = usn_calendar(2025, usn=usn)
    notif_q1 = next(e for e in events if "Уведомление" in e.title and "1 квартал" in e.title)
    assert notif_q1.amount is None  # в уведомление за Q1 не попадает годовой налог


def test_calendar_quarterly_amounts_present_for_full_periods():
    periods = [
        PeriodData("1 квартал", 250_000),
        PeriodData("полугодие", 500_000),
        PeriodData("9 месяцев", 750_000),
        PeriodData("год", 1_000_000),
    ]
    usn = calc_usn(2025, UsnObject.INCOME, periods)
    events = usn_calendar(2025, usn=usn)
    q1 = next(e for e in events if e.title == "Аванс по УСН за 1 квартал")
    assert q1.amount == 15_000  # 250 000 * 6%
    usn_payments = [
        e.amount for e in events
        if e.kind == "payment" and "УСН" in e.title and e.amount is not None
    ]
    assert sum(usn_payments, D("0")) == usn.tax_year_final  # 60 000


# --- Мусорные входы больше не дают неверную сумму --------------------------

def test_negative_contributions_do_not_inflate_tax():
    r = usn_quick(2025, UsnObject.INCOME, 1_000_000, contributions_to_deduct=-50_000)
    assert r.tax_year_final == 60_000  # вычет не может быть отрицательным


def test_negative_income_clamped_to_zero():
    r = usn_quick(2025, UsnObject.INCOME, -500_000)
    assert r.tax_year_final == 0
    assert r.periods[0].tax_before_deduction_cumulative == 0


def test_50pct_cap_floored_not_rounded_up():
    # tax_before = round_rub(500017*0.06)=30001; потолок 50% = floor(15000.5)=15000.
    r = usn_quick(
        2025, UsnObject.INCOME, 500_017,
        contributions_to_deduct=10_000_000, has_employees=True,
    )
    assert r.periods[0].tax_before_deduction_cumulative == 30_001
    assert r.periods[0].deduction_cumulative == 15_000


def test_to_decimal_rejects_garbage():
    for bad in (None, float("nan"), float("inf"), "", True):
        with pytest.raises(ValueError):
            to_decimal(bad)


def test_round_rub_rejects_nan():
    with pytest.raises(ValueError):
        round_rub(float("nan"))


# --- Дробные взносы → налог всё равно в целых рублях (ст. 52 НК) -----------

def test_tax_is_whole_rubles_even_with_kopeck_contributions():
    r = usn_quick(2025, UsnObject.INCOME, 1_234_567, contributions_to_deduct=D("63003.67"))
    assert r.tax_year_final == round_rub(r.tax_year_final)  # без копеек
