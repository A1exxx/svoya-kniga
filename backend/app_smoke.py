r"""Дымовой тест API без поднятия сервера (через TestClient).

Запуск из backend/:  .\.venv\Scripts\python.exe app_smoke.py
"""
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)


def show(title, resp):
    print(f"\n### {title}  [HTTP {resp.status_code}]")
    print(json.dumps(resp.json(), ensure_ascii=False, indent=2, default=str))


show("health", c.get("/api/health"))
show("params 2025", c.get("/api/params/2025"))
show("params 2026 (несверённый)", c.get("/api/params/2026"))
show("params unknown -> 404", c.get("/api/params/2010"))
show(
    "calc УСН Доходы 6%, доход 2.4М",
    c.post("/api/calc", json={"year": 2025, "usn_object": "income", "income": 2400000}),
)
show(
    "calc УСН Доходы-расходы, мин.налог",
    c.post("/api/calc", json={
        "year": 2025, "usn_object": "income_minus",
        "income": 2000000, "expenses": 1900000,
    }),
)
show(
    "calc/periods поквартально (Доходы)",
    c.post("/api/calc/periods", json={
        "year": 2025, "usn_object": "income",
        "periods": [
            {"label": "1 квартал", "income_cumulative": 600000, "contributions_to_deduct_cumulative": 13415},
            {"label": "полугодие", "income_cumulative": 1200000, "contributions_to_deduct_cumulative": 26830},
            {"label": "9 месяцев", "income_cumulative": 1800000, "contributions_to_deduct_cumulative": 40245},
            {"label": "год", "income_cumulative": 2400000, "contributions_to_deduct_cumulative": 74658},
        ],
    }),
)
show(
    "calc невалидный usn_object -> 422",
    c.post("/api/calc", json={"year": 2025, "usn_object": "patent", "income": 100000}),
)

print("\nOK: smoke завершён")
