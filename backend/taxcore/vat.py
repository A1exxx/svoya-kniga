"""НДС для ИП на УСН (с 01.01.2025, Федеральный закон № 176-ФЗ).

С 2025 года упрощенцы становятся плательщиками НДС, если доход превышает порог
освобождения. Возможны пониженные («специальные») ставки без права на вычет
входящего НДС, либо общие ставки (20%/10%) с вычетом.

Правила (2025–2026):
  • Освобождение, если доход за предыдущий ИЛИ текущий год ≤ 60 млн ₽
    (п. 1 ст. 145 НК РФ в ред. ФЗ-176). Новый ИП в первый год — освобождён.
  • Специальные ставки (ст. 164 НК РФ):
      – 5%  при доходе 60–250 млн ₽;
      – 7%  при доходе 250–450 млн ₽ (450 млн — верхний лимит УСН).
    По спец-ставкам входящий НДС к вычету НЕ принимается (учитывается в стоимости).
  • Общая ставка 20% (или 10% по льготным товарам) — с вычетом входящего НДС.

⚠️ Пороги 60/250/450 млн действуют на 2025–2026. С 2027 порог освобождения
планово снижается (15 млн) — проверять перед применением. Значения подлежат
проверке бухгалтером.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .models import round_rub, to_decimal

__all__ = [
    "VAT_EXEMPT_THRESHOLD",
    "VAT_RATE5_LIMIT",
    "VAT_RATE7_LIMIT",
    "VatResult",
    "calc_vat_usn",
]

# Пороги дохода (без НДS), ₽.
VAT_EXEMPT_THRESHOLD = Decimal("60000000")   # ≤ 60 млн → освобождение
VAT_RATE5_LIMIT = Decimal("250000000")       # 60–250 млн → 5%
VAT_RATE7_LIMIT = Decimal("450000000")       # 250–450 млн → 7%


@dataclass
class VatResult:
    """Результат расчёта НДС для УСН."""

    obligated: bool          # обязан ли платить НДС (доход выше порога)
    exempt: bool             # освобождён (доход ≤ 60 млн)
    rate: Decimal            # ставка, %
    base: Decimal            # налоговая база (выручка без НДС), руб.
    vat: Decimal             # НДС к уплате, руб.
    input_vat_deducted: Decimal  # принятый к вычету входящий НДС (только для 20%)
    mode: str                # 'none' | 'rate5' | 'rate7' | 'general20'
    notes: list[str] = field(default_factory=list)


def calc_vat_usn(
    year: int,
    income,
    *,
    prior_year_income=0,
    mode: str = "auto",
    income_includes_vat: bool = True,
    input_vat=0,
) -> VatResult:
    """Расчёт НДС для ИП на УСН.

    :param income: доход за текущий год (выручка).
    :param prior_year_income: доход за прошлый год (для проверки порога освобождения).
    :param mode: 'auto' (спец-ставка 5/7 по порогу) | 'none' | 'rate5' | 'rate7' | 'general20'.
    :param income_includes_vat: True, если выручка указана С НДС (тогда налог выделяется изнутри).
    :param input_vat: входящий НДС к вычету (только для общей ставки 20%).
    """
    inc = to_decimal(income)
    prior = to_decimal(prior_year_income)
    if inc < 0 or prior < 0:
        raise ValueError("Доход не может быть отрицательным")

    threshold_base = max(inc, prior)
    obligated = threshold_base > VAT_EXEMPT_THRESHOLD
    notes: list[str] = []

    if year >= 2027:
        notes.append(
            "С 2027 порог освобождения от НДС планово снижается (15 млн ₽) — "
            "проверить актуальное значение."
        )

    # Освобождение: режим 'none' или авто-режим при доходе ≤ 60 млн.
    if mode == "none" or (mode == "auto" and not obligated):
        if not obligated:
            notes.append("Доход ≤ 60 млн ₽ — освобождение от НДС (ст. 145 НК РФ).")
        else:
            notes.append("НДС не начисляется по выбору (режим «без НДС»).")
        return VatResult(
            obligated=obligated,
            exempt=not obligated,
            rate=Decimal("0"),
            base=round_rub(inc),
            vat=Decimal("0"),
            input_vat_deducted=Decimal("0"),
            mode="none",
            notes=notes,
        )

    # Доход выше потолка УСН (450 млн) — спец-ставки 5/7% неприменимы (право на УСН утрачено).
    if mode in ("auto", "rate5", "rate7") and inc > VAT_RATE7_LIMIT:
        notes.append(
            "Доход превысил 450 млн ₽ — право на УСН утрачено: НДС считается по общей системе "
            "(ОСНО, ставка 20%); спец-ставка 5/7% неприменима."
        )
        return VatResult(
            obligated=True,
            exempt=False,
            rate=Decimal("0"),
            base=round_rub(inc),
            vat=Decimal("0"),
            input_vat_deducted=Decimal("0"),
            mode="usn_lost",
            notes=notes,
        )

    # Определение ставки.
    if mode == "auto":
        rate = Decimal("5") if inc <= VAT_RATE5_LIMIT else Decimal("7")
        applied_mode = "rate5" if rate == Decimal("5") else "rate7"
    elif mode == "rate5":
        rate, applied_mode = Decimal("5"), "rate5"
    elif mode == "rate7":
        rate, applied_mode = Decimal("7"), "rate7"
    elif mode == "general20":
        rate, applied_mode = Decimal("20"), "general20"
    else:
        raise ValueError(f"Неизвестный режим НДС: {mode!r}")

    if inc > VAT_RATE7_LIMIT:
        notes.append("Доход превышает 450 млн ₽ — утрата права на УСН, проверить отдельно.")

    if rate in (Decimal("5"), Decimal("7")):
        # Спец-ставки: налоговая база = выручка без НДС, вычет входящего НДС не применяется.
        if income_includes_vat:
            base = inc / (Decimal("1") + rate / Decimal("100"))
            vat = inc - base
        else:
            base = inc
            vat = inc * rate / Decimal("100")
        deducted = Decimal("0")
        notes.append(
            f"Специальная ставка {rate}% — без вычета входящего НДС "
            "(входящий учитывается в стоимости, ст. 170 НК РФ)."
        )
    else:
        # Общая ставка 20%: НДС = исходящий − входящий (к вычету).
        if income_includes_vat:
            base = inc / Decimal("1.20")
            output = inc - base
        else:
            base = inc
            output = inc * Decimal("0.20")
        deducted = to_decimal(input_vat)
        if deducted < 0:
            raise ValueError("Входящий НДС не может быть отрицательным")
        vat = output - deducted
        if vat < 0:
            vat = Decimal("0")
        notes.append("Общая ставка 20% — с вычетом входящего НДС (ст. 171–172 НК РФ).")

    return VatResult(
        obligated=True,
        exempt=False,
        rate=rate,
        base=round_rub(base),
        vat=round_rub(vat),
        input_vat_deducted=round_rub(deducted),
        mode=applied_mode,
        notes=notes,
    )
