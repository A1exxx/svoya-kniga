"""Быстрая демонстрация расчётов taxcore без интерфейса.

Запуск из backend/:
    .\.venv\Scripts\python.exe demo.py

Пример: ИП на УСН «Доходы» 6%, без работников, доход 2 400 000 ₽/год,
равномерно по 600 000 ₽ за квартал.
"""
from decimal import Decimal

from taxcore import (
    PeriodData,
    UsnObject,
    calc_contributions,
    calc_usn,
    get_params,
    usn_calendar,
)

YEAR = 2025
INCOME = Decimal("2400000")


def hr() -> None:
    print("-" * 64)


def main() -> None:
    print(f"ИП на УСН «Доходы» 6%, без работников, {YEAR} год")
    print(f"Годовой доход: {INCOME:,.0f} ₽".replace(",", " "))
    hr()

    contr = calc_contributions(YEAR, INCOME)
    print("Страховые взносы ИП «за себя»:")
    print(f"  фиксированные:  {contr.fixed} ₽   (срок {contr.fixed_due})")
    print(f"  1% свыше 300т:  {contr.one_percent} ₽   (срок {contr.one_percent_due})")
    print(f"  ИТОГО взносов:  {contr.total} ₽")
    hr()

    # Взносы к вычету нарастающим итогом: фикс. часть поквартально, 1% — учтён в конце года.
    deductions = [Decimal("13415"), Decimal("26830"), Decimal("40245"), contr.total]
    periods = [
        PeriodData("1 квартал", 600_000, contributions_to_deduct_cumulative=deductions[0]),
        PeriodData("полугодие", 1_200_000, contributions_to_deduct_cumulative=deductions[1]),
        PeriodData("9 месяцев", 1_800_000, contributions_to_deduct_cumulative=deductions[2]),
        PeriodData("год", 2_400_000, contributions_to_deduct_cumulative=deductions[3]),
    ]
    usn = calc_usn(YEAR, UsnObject.INCOME, periods, has_employees=False)

    print("УСН по периодам (нарастающим итогом):")
    print(f"  {'период':<11} {'налог 6%':>10} {'вычет':>10} {'к уплате':>10}")
    for p in usn.periods:
        print(
            f"  {p.label:<11} {p.tax_before_deduction_cumulative:>10} "
            f"{p.deduction_cumulative:>10} {p.advance_due_this_period:>10}"
        )
    print(f"  Итого налог УСН за год: {usn.tax_year_final} ₽ "
          f"(авансы {usn.advances_paid_total} + доплата {usn.year_payment_due})")
    hr()

    print("Налоговый календарь:")
    for e in usn_calendar(YEAR, usn=usn, contributions=contr):
        amt = f"{e.amount} ₽" if e.amount is not None else "—"
        print(f"  {e.due}  [{e.kind:<12}] {e.title}: {amt}")
    hr()

    p = get_params(YEAR)
    print(f"Параметры {YEAR}: сверены={p.verified}. {p.note}")


if __name__ == "__main__":
    main()
