"""Тесты расчёта УСН. Эталонные значения посчитаны вручную."""
from decimal import Decimal as D

from taxcore import PeriodData, UsnObject, calc_usn, usn_quick


# --- УСН «Доходы» 6% ------------------------------------------------------

def test_income_contributions_cover_tax():
    # Доход 1 000 000 → налог 60 000; взносы 60 658 (без работников) перекрывают налог → 0.
    r = usn_quick(2025, UsnObject.INCOME, income=1_000_000, contributions_to_deduct=60_658)
    assert r.periods[0].tax_before_deduction_cumulative == 60_000
    assert r.tax_year_final == 0
    assert r.year_payment_due == 0


def test_income_partial_deduction():
    # Доход 3 000 000 → налог 180 000; вычет взносов 60 658 → к уплате 119 342.
    r = usn_quick(2025, UsnObject.INCOME, income=3_000_000, contributions_to_deduct=60_658)
    assert r.periods[0].tax_before_deduction_cumulative == 180_000
    assert r.periods[0].deduction_cumulative == 60_658
    assert r.tax_year_final == 119_342
    assert r.year_payment_due == 119_342


def test_income_with_employees_50pct_cap():
    # С работниками вычет не более 50% налога.
    r = usn_quick(
        2025, UsnObject.INCOME, income=1_000_000,
        contributions_to_deduct=100_000, has_employees=True,
    )
    assert r.periods[0].tax_before_deduction_cumulative == 60_000
    assert r.periods[0].deduction_cumulative == 30_000   # 50% от 60 000
    assert r.tax_year_final == 30_000


def test_income_quarterly_cumulative():
    # Авансы нарастающим итогом, без работников.
    periods = [
        PeriodData("1 квартал", 300_000, contributions_to_deduct_cumulative=13_415),
        PeriodData("полугодие", 600_000, contributions_to_deduct_cumulative=26_830),
        PeriodData("9 месяцев", 900_000, contributions_to_deduct_cumulative=40_245),
        PeriodData("год", 1_200_000, contributions_to_deduct_cumulative=53_658),
    ]
    r = calc_usn(2025, UsnObject.INCOME, periods, has_employees=False)
    advances = [p.advance_due_this_period for p in r.periods]
    assert advances == [D("4585"), D("4585"), D("4585"), D("4587")]
    assert r.advances_paid_total == 13_755
    assert r.year_payment_due == 4_587
    assert r.tax_year_final == 18_342
    assert r.tax_year_computed == 18_342


# --- УСН «Доходы минус расходы» 15% --------------------------------------

def test_income_minus_no_min_tax():
    # База 1 000 000 → налог 150 000 (минимальный 20 000 меньше).
    r = usn_quick(2025, UsnObject.INCOME_MINUS, income=2_000_000, expenses=1_000_000)
    assert r.tax_year_computed == 150_000
    assert r.min_tax == 20_000
    assert r.tax_year_final == 150_000


def test_income_minus_min_tax_applies():
    # База 100 000 → налог 15 000, но минимальный налог 20 000 больше → платим 20 000.
    r = usn_quick(2025, UsnObject.INCOME_MINUS, income=2_000_000, expenses=1_900_000)
    assert r.tax_year_computed == 15_000
    assert r.min_tax == 20_000
    assert r.tax_year_final == 20_000
    assert r.year_payment_due == 20_000


def test_income_minus_quarterly_with_min_tax():
    # Авансы платились с прибыли, а по году сработал минимальный налог.
    periods = [
        PeriodData("1 квартал", 500_000, expenses_cumulative=450_000),
        PeriodData("полугодие", 1_000_000, expenses_cumulative=950_000),
        PeriodData("9 месяцев", 1_500_000, expenses_cumulative=1_450_000),
        PeriodData("год", 2_000_000, expenses_cumulative=1_980_000),
    ]
    r = calc_usn(2025, UsnObject.INCOME_MINUS, periods)
    assert r.periods[0].advance_due_this_period == 7_500   # 50 000 * 15%
    assert r.min_tax == 20_000
    assert r.tax_year_final == 20_000
    assert r.advances_paid_total == 7_500
    assert r.year_payment_due == 12_500                    # 20 000 − 7 500


def test_regional_rate_override():
    # Региональная ставка 1% («Доходы»).
    r = usn_quick(2025, UsnObject.INCOME, income=1_000_000, rate=D("0.01"))
    assert r.rate == D("0.01")
    assert r.periods[0].tax_before_deduction_cumulative == 10_000
