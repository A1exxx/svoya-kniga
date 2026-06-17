"""Патентная система налогообложения (ПСН) для ИП.

Стоимость патента = потенциально возможный годовой доход (ПВГД) × 6% × срок/12.
С 2021 патент можно уменьшить на страховые взносы (как УСН «Доходы»): ИП без
работников — до 100%, с работниками — не более 50% (ст. 346.51 НК РФ).

ПВГД устанавливается региональным законом по виду деятельности — вводится
пользователем (берётся из заявления на патент / регионального закона).

Сроки уплаты (ст. 346.51 НК РФ):
  • патент до 6 месяцев — вся сумма до конца срока;
  • патент 6–12 месяцев — 1/3 в течение 90 дней с начала, 2/3 до конца срока.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_DOWN

from .models import round_rub, to_decimal

__all__ = ["PATENT_RATE", "PatentResult", "calc_patent"]

PATENT_RATE = Decimal("0.06")


@dataclass
class PatentResult:
    potential_income: Decimal       # ПВГД (за год)
    months: int                     # срок патента, мес.
    rate: Decimal                   # ставка, %
    base: Decimal                   # налоговая база за срок (ПВГД × срок/12)
    cost_before_deduction: Decimal  # стоимость до вычета взносов
    deduction: Decimal              # принятые к вычету взносы
    cost: Decimal                   # к уплате
    schedule: list                  # [(описание, сумма)]
    notes: list = field(default_factory=list)


def calc_patent(
    year: int,
    potential_income,
    months: int = 12,
    *,
    contributions_to_deduct=0,
    has_employees: bool = False,
) -> PatentResult:
    if months < 1 or months > 12:
        raise ValueError("Срок патента — от 1 до 12 месяцев")
    pi = to_decimal(potential_income)
    if pi < 0:
        raise ValueError("ПВГД не может быть отрицательным")
    deduct = to_decimal(contributions_to_deduct)
    if deduct < 0:
        raise ValueError("Взносы не могут быть отрицательными")

    base = pi * Decimal(months) / Decimal(12)
    cost_before = round_rub(base * PATENT_RATE)

    if has_employees:
        max_ded = (cost_before * Decimal("0.5")).quantize(Decimal("1"), rounding=ROUND_DOWN)
        applied = max(Decimal(0), min(deduct, max_ded))
    else:
        applied = max(Decimal(0), min(deduct, cost_before))

    cost = cost_before - applied
    if cost < 0:
        cost = Decimal(0)
    cost = round_rub(cost)

    if months <= 6:
        schedule = [("Вся сумма — до конца срока патента", cost)]
    else:
        first = round_rub(cost / 3)
        schedule = [
            ("1/3 — в течение 90 дней с начала действия", first),
            ("2/3 — до конца срока патента", cost - first),
        ]

    notes = (
        ["До 2021 года уменьшение патента на страховые взносы не применялось — проверить."]
        if year < 2021
        else ["Стоимость патента уменьшается на страховые взносы (с 2021), как УСН «Доходы»."]
    )
    return PatentResult(
        potential_income=round_rub(pi),
        months=months,
        rate=PATENT_RATE * 100,
        base=round_rub(base),
        cost_before_deduction=cost_before,
        deduction=round_rub(applied),
        cost=cost,
        schedule=schedule,
        notes=notes,
    )
