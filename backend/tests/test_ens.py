"""Тесты налогового календаря ИП на УСН."""
from taxcore import UsnObject, calc_contributions, usn_calendar, usn_quick


def test_calendar_structure():
    events = usn_calendar(2025)
    assert len(events) == 10
    # отсортировано по дате
    assert events == sorted(events, key=lambda e: e.due)
    # все сроки перенесены на рабочий день
    assert all(e.due.weekday() < 5 for e in events)


def test_calendar_has_key_items():
    titles = [e.title for e in usn_calendar(2025)]
    assert any("Декларация" in t for t in titles)
    assert any("1 квартал" in t for t in titles)
    assert any("Фиксированные страховые взносы" in t for t in titles)
    assert any("1% с дохода свыше" in t for t in titles)


def test_calendar_fills_amounts():
    contr = calc_contributions(2025, income=1_000_000)
    usn = usn_quick(2025, UsnObject.INCOME, income=1_000_000, contributions_to_deduct=60_658)
    events = usn_calendar(2025, usn=usn, contributions=contr)

    fixed_ev = next(e for e in events if "Фиксированные" in e.title)
    assert fixed_ev.amount == 53658

    one_pct_ev = next(e for e in events if "1% с дохода" in e.title)
    assert one_pct_ev.amount == 7000


def test_calendar_spans_two_years():
    events = usn_calendar(2025)
    years = {e.due.year for e in events}
    # авансы/взносы 2025 + декларация и налог за год в 2026
    assert 2025 in years and 2026 in years
