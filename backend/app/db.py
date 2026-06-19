"""Слой базы данных: движок SQLAlchemy + сессии.

По умолчанию — SQLite (файл рядом, нулевая настройка для локального запуска).
В проде — PostgreSQL через переменную окружения DATABASE_URL
(например, postgresql+psycopg://user:pass@host:5432/svoyakniga).
Схема одинаковая — переносится между провайдерами через pg_dump/pg_restore.
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DATABASE_URL: прод → Postgres; по умолчанию → локальный SQLite-файл.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./svoyakniga.db")

# SQLite требует check_same_thread=False для работы с FastAPI (пул потоков).
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI-зависимость: сессия БД на запрос (закрывается после)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Создать таблицы, если их нет (для SQLite/первого запуска).
    В проде схему накатывает Alembic — здесь безопасный create_all (idempotent)."""
    from . import models  # noqa: F401 — регистрация моделей в метаданных

    Base.metadata.create_all(bind=engine)
