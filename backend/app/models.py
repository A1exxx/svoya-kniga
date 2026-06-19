"""Модель данных «СвояКниги» на сервере.

Гибрид по рекомендации ресёрча: реляционные таблицы для аккаунтов и рабочих
столов + версионируемый JSON-снимок всего рабочего стола (история ревизий).
Это даёт быстрый старт И «чтобы ничего не потерялось»: КАЖДОЕ сохранение —
новая неизменяемая ревизия, к которой можно откатиться.

Один пользователь → один рабочий стол (workspace) → много ревизий
(workspace_versions). Внутри JSON — все ИП, операции, документы, сотрудники
(тот же формат, что и локальный экспорт/бэкап фронтенда).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    # Наивный UTC: SQLite не хранит таймзону, поэтому держим единый naive-UTC
    # во всей схеме — сравнения дат работают и на SQLite, и на Postgres.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    workspaces: Mapped[list["Workspace"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Workspace(Base):
    """Рабочий стол пользователя — весь его «кабинет СвояКниги» как документ."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="Мой кабинет")
    current_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="workspaces")
    versions: Mapped[list["WorkspaceVersion"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", order_by="WorkspaceVersion.version"
    )


class WorkspaceVersion(Base):
    """Неизменяемая ревизия рабочего стола. Каждое сохранение = новая запись.
    История = многослойная защита от потери (откат к любой точке)."""

    __tablename__ = "workspace_versions"
    # Номер версии уникален в пределах рабочего стола — БД не даст создать дубль
    # при конкурентном сохранении (две вкладки/устройства). См. _store_version (retry).
    __table_args__ = (UniqueConstraint("workspace_id", "version", name="uq_ws_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    # JSON-снимок всего рабочего стола (Text — портируемо между SQLite/Postgres).
    data: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(255), default="")
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="versions")


class Session(Base):
    """Серверная сессия (opaque-токен в httpOnly-cookie). Можно отозвать —
    в отличие от чистого JWT (logout на всех устройствах)."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped["User"] = relationship(back_populates="sessions")


class AuditLog(Base):
    """Журнал значимых действий аккаунта (вход/регистрация/восстановление)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(String(512), default="")
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
