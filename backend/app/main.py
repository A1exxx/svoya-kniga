r"""FastAPI поверх ядра taxcore — тонкий слой для UI.

Запуск (из backend/):
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8077
Документация: http://127.0.0.1:8077/docs
"""
from __future__ import annotations

from dataclasses import asdict
from decimal import Decimal
from typing import List, Optional

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from taxcore import (
    PeriodData,
    UsnObject,
    YEARS,
    calc_contributions,
    calc_usn,
    get_params,
    usn_calendar,
    usn_quick,
)

from .auth import router as auth_router
from .db import init_db
from .sync import router as sync_router
from .team import router as team_router

app = FastAPI(title="СвояКнига API", version="0.3.0")

# Источники для CORS. С куками нельзя "*" — перечисляем явные origin
# (локалка + адрес фронтенда). Задаётся через CORS_ORIGINS (через запятую).
_default_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5180,https://a1exxx.github.io"
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,  # cookie-сессии
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(sync_router)
app.include_router(team_router)


@app.on_event("startup")
def _startup() -> None:
    # Создать таблицы при первом запуске (SQLite/локально). В проде схему
    # накатывает Alembic; create_all idempotent и не мешает.
    init_db()


def _obj(value: str) -> UsnObject:
    try:
        return UsnObject(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"usn_object должен быть 'income' или 'income_minus', получено {value!r}",
        )


# ---------- Запросы ----------

class CalcRequest(BaseModel):
    year: int = 2025
    usn_object: str = "income"                       # "income" | "income_minus"
    income: Decimal = Field(ge=0)
    expenses: Decimal = Field(default=0, ge=0)
    has_employees: bool = False
    contributions_to_deduct: Optional[Decimal] = None  # для «Доходы»; None → вся сумма взносов
    rate: Optional[Decimal] = None


class PeriodIn(BaseModel):
    label: str
    income_cumulative: Decimal = Field(ge=0)
    expenses_cumulative: Decimal = Field(default=0, ge=0)
    contributions_to_deduct_cumulative: Decimal = Field(default=0, ge=0)


class PeriodsRequest(BaseModel):
    year: int = 2025
    usn_object: str = "income"
    has_employees: bool = False
    rate: Optional[Decimal] = None
    periods: List[PeriodIn]


# ---------- Эндпоинты ----------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/params")
def params_years():
    return {"years": sorted(YEARS)}


@app.get("/api/params/{year}")
def params(year: int):
    try:
        return asdict(get_params(year))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/calc")
def calc(req: CalcRequest):
    """Годовой расчёт: взносы + УСН + календарь (даты)."""
    obj = _obj(req.usn_object)
    try:
        contr = calc_contributions(req.year, req.income, req.expenses, obj)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if obj == UsnObject.INCOME:
        ded = req.contributions_to_deduct if req.contributions_to_deduct is not None else contr.total
    else:
        ded = Decimal("0")

    usn = usn_quick(
        req.year, obj, req.income,
        expenses=req.expenses, contributions_to_deduct=ded,
        has_employees=req.has_employees, rate=req.rate,
    )
    # Календарь: даты + суммы взносов (поквартальные авансы из годового расчёта не выводим,
    # чтобы не вводить в заблуждение — для них есть /api/calc/periods).
    cal = usn_calendar(req.year, usn=None, contributions=contr)

    return {
        "vznosy": asdict(contr),
        "usn": asdict(usn),
        "calendar": [asdict(e) for e in cal],
    }


@app.post("/api/calc/periods")
def calc_periods(req: PeriodsRequest):
    """Поквартальный расчёт нарастающим итогом + календарь с суммами авансов."""
    obj = _obj(req.usn_object)
    periods = [
        PeriodData(
            p.label, p.income_cumulative,
            p.expenses_cumulative, p.contributions_to_deduct_cumulative,
        )
        for p in req.periods
    ]
    try:
        usn = calc_usn(req.year, obj, periods, has_employees=req.has_employees, rate=req.rate)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    cal = usn_calendar(req.year, usn=usn)
    return {"usn": asdict(usn), "calendar": [asdict(e) for e in cal]}


# ---------- Отдача собранного фронтенда (локальный режим «всё в одном») ----------
# Если рядом собран фронт (web/dist-local или web/dist), бэкенд отдаёт и приложение,
# и API с ОДНОГО адреса — тогда вход/cookie работают без CORS. Монтируется ПОСЛЕ
# всех /api-роутов, поэтому API имеет приоритет. HashRouter → нужен только index.html.
from pathlib import Path  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402


def _frontend_dir() -> "Path | None":
    env = os.environ.get("FRONTEND_DIST")
    if env and Path(env).is_dir():
        return Path(env)
    base = Path(__file__).resolve().parent.parent.parent / "web"
    for name in ("dist-local", "dist"):
        p = base / name
        if (p / "index.html").is_file():
            return p
    return None


_FRONTEND = _frontend_dir()
if _FRONTEND is not None:
    app.mount("/", StaticFiles(directory=str(_FRONTEND), html=True), name="frontend")
