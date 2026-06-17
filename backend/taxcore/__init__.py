"""taxcore — ядро налоговых расчётов для ИП на УСН (Россия).

Состав:
  • params  — параметры налогов по годам (ставки, взносы, лимиты);
  • vznosy  — страховые взносы ИП (фикс + 1% свыше 300 000 ₽);
  • usn     — расчёт УСН (доходы 6% / доходы−расходы 15%, авансы, мин. налог);
  • ens     — налоговый календарь и уведомления.

Все суммы — Decimal. Значения параметров подлежат проверке бухгалтером.
"""
from .models import UsnObject, money, round_rub, shift_to_workday, to_decimal
from .params import DEFAULT_YEAR, YEARS, YearParams, get_params
from .vznosy import ContributionsResult, calc_contributions
from .usn import PeriodData, PeriodResult, UsnYearResult, calc_usn, usn_quick
from .ens import CalendarEvent, usn_calendar
from .vat import VatResult, calc_vat_usn
from .payroll import (
    PAYROLL,
    AlimonyResult,
    PayrollParams,
    SalaryMonth,
    SalaryResult,
    SickLeaveResult,
    VacationResult,
    calc_alimony,
    calc_salary,
    calc_sick_leave,
    calc_vacation,
    child_deduction_monthly,
    get_payroll,
    ndfl_progressive,
)

__all__ = [
    # models
    "UsnObject", "money", "round_rub", "shift_to_workday", "to_decimal",
    # params
    "DEFAULT_YEAR", "YEARS", "YearParams", "get_params",
    # vznosy
    "ContributionsResult", "calc_contributions",
    # usn
    "PeriodData", "PeriodResult", "UsnYearResult", "calc_usn", "usn_quick",
    # ens
    "CalendarEvent", "usn_calendar",
    # vat
    "VatResult", "calc_vat_usn",
    # payroll
    "PayrollParams", "PAYROLL", "get_payroll", "ndfl_progressive", "child_deduction_monthly",
    "SalaryMonth", "SalaryResult", "calc_salary",
    "VacationResult", "calc_vacation", "SickLeaveResult", "calc_sick_leave",
    "AlimonyResult", "calc_alimony",
]
