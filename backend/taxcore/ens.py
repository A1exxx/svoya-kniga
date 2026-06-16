"""ЕНС, уведомления и налоговый календарь для ИП на УСН.

Сроки (с переносом с выходного; госпраздники проверять отдельно):
  • Авансы УСН: 28 апреля / 28 июля / 28 октября (за Q1 / полугодие / 9 мес.).
  • Налог УСН за год (ИП): 28 апреля следующего года.
  • Декларация УСН (ИП): 25 апреля следующего года.
  • Уведомления об исчисленных авансах: 25 апреля / 25 июля / 25 октября
    (по году уведомление не подаётся — есть декларация).
  • Фиксированные взносы: 28 декабря; 1% свыше 300 000 ₽: 1 июля следующего года.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .models import shift_to_workday
from .usn import UsnYearResult
from .vznosy import ContributionsResult

__all__ = ["CalendarEvent", "usn_calendar"]


@dataclass
class CalendarEvent:
    due: date
    kind: str                       # "payment" | "report" | "notification"
    title: str
    amount: Decimal | None = None
    note: str = ""


def usn_calendar(
    tax_year: int,
    usn: UsnYearResult | None = None,
    contributions: ContributionsResult | None = None,
) -> list[CalendarEvent]:
    """Список событий налогового календаря ИП на УСН за `tax_year`.

    Если переданы расчёты (`usn`, `contributions`) — подставляются суммы.
    """

    def adv(i: int) -> Decimal | None:
        if usn is not None and len(usn.periods) > i:
            return usn.periods[i].advance_due_this_period
        return None

    events = [
        CalendarEvent(date(tax_year, 4, 25), "notification",
                      "Уведомление об исчисленном авансе УСН за 1 квартал", adv(0)),
        CalendarEvent(date(tax_year, 4, 28), "payment",
                      "Аванс по УСН за 1 квартал", adv(0)),
        CalendarEvent(date(tax_year, 7, 25), "notification",
                      "Уведомление об исчисленном авансе УСН за полугодие", adv(1)),
        CalendarEvent(date(tax_year, 7, 28), "payment",
                      "Аванс по УСН за полугодие", adv(1)),
        CalendarEvent(date(tax_year, 10, 25), "notification",
                      "Уведомление об исчисленном авансе УСН за 9 месяцев", adv(2)),
        CalendarEvent(date(tax_year, 10, 28), "payment",
                      "Аванс по УСН за 9 месяцев", adv(2)),
        CalendarEvent(date(tax_year, 12, 28), "payment",
                      "Фиксированные страховые взносы ИП",
                      contributions.fixed if contributions else None),
        CalendarEvent(date(tax_year + 1, 4, 25), "report",
                      "Декларация по УСН за год", None, note="Подаётся в ФНС"),
        CalendarEvent(date(tax_year + 1, 4, 28), "payment",
                      "Налог по УСН за год (доплата)",
                      usn.year_payment_due if usn else None),
        CalendarEvent(date(tax_year + 1, 7, 1), "payment",
                      "Взносы ИП 1% с дохода свыше 300 000 ₽",
                      contributions.one_percent if contributions else None),
    ]

    # перенос с выходного на рабочий день
    for e in events:
        e.due = shift_to_workday(e.due)
    events.sort(key=lambda e: e.due)
    return events
