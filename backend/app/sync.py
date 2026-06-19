"""Синхронизация рабочего стола: загрузка/сохранение с историей версий.

Каждое сохранение — новая неизменяемая ревизия (workspace_versions). Это и есть
многослойная защита «чтобы ничего не потерялось»: можно посмотреть список
версий и откатиться к любой. Формат data — тот же JSON, что локальный
бэкап фронтенда (весь кабинет: ИП, операции, документы, сотрудники).
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .auth import current_user
from .db import get_db
from .models import User, Workspace, WorkspaceVersion, utcnow

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# Защита от чрезмерно больших документов (картинки логотипов/печатей внутри JSON).
MAX_DOC_BYTES = 8 * 1024 * 1024  # 8 МБ


def _get_workspace(db: DbSession, user: User) -> Workspace:
    ws = db.scalar(select(Workspace).where(Workspace.user_id == user.id).order_by(Workspace.id))
    if ws is None:
        ws = Workspace(user_id=user.id, name="Мой кабинет")
        db.add(ws)
        db.flush()
    return ws


def _latest_version(db: DbSession, ws: Workspace) -> WorkspaceVersion | None:
    return db.scalar(
        select(WorkspaceVersion)
        .where(WorkspaceVersion.workspace_id == ws.id)
        .order_by(WorkspaceVersion.version.desc())
    )


class SaveIn(BaseModel):
    data: dict[str, Any]
    note: str = Field(default="автосохранение", max_length=255)


class SaveOut(BaseModel):
    version: int
    saved_at: str


def _store_version(db: DbSession, ws: Workspace, data: dict, note: str) -> WorkspaceVersion:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    size = len(payload.encode("utf-8"))
    if size > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Слишком большой документ (>8 МБ)")
    ver = WorkspaceVersion(
        workspace_id=ws.id,
        version=ws.current_version + 1,
        data=payload,
        size_bytes=size,
        note=note[:255],
        saved_at=utcnow(),
    )
    db.add(ver)
    ws.current_version = ver.version
    ws.updated_at = utcnow()
    return ver


@router.get("")
def get_workspace(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ws = _get_workspace(db, user)
    db.commit()
    latest = _latest_version(db, ws)
    if latest is None:
        return {"version": 0, "data": None, "saved_at": None}
    return {"version": latest.version, "data": json.loads(latest.data), "saved_at": latest.saved_at.isoformat()}


@router.put("", response_model=SaveOut)
def save_workspace(body: SaveIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ws = _get_workspace(db, user)
    ver = _store_version(db, ws, body.data, body.note)
    db.commit()
    return SaveOut(version=ver.version, saved_at=ver.saved_at.isoformat())


@router.get("/versions")
def list_versions(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ws = _get_workspace(db, user)
    db.commit()
    rows = db.scalars(
        select(WorkspaceVersion)
        .where(WorkspaceVersion.workspace_id == ws.id)
        .order_by(WorkspaceVersion.version.desc())
    ).all()
    return {
        "current": ws.current_version,
        "versions": [
            {"version": v.version, "saved_at": v.saved_at.isoformat(), "size_bytes": v.size_bytes, "note": v.note}
            for v in rows
        ],
    }


@router.get("/versions/{version}")
def get_version(version: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ws = _get_workspace(db, user)
    db.commit()
    v = db.scalar(
        select(WorkspaceVersion).where(
            WorkspaceVersion.workspace_id == ws.id, WorkspaceVersion.version == version
        )
    )
    if v is None:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    return {"version": v.version, "data": json.loads(v.data), "saved_at": v.saved_at.isoformat()}


@router.post("/restore/{version}", response_model=SaveOut)
def restore_version(version: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Откат: создаёт НОВУЮ версию с данными из старой (старые ревизии не трогаем)."""
    ws = _get_workspace(db, user)
    src = db.scalar(
        select(WorkspaceVersion).where(
            WorkspaceVersion.workspace_id == ws.id, WorkspaceVersion.version == version
        )
    )
    if src is None:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    ver = _store_version(db, ws, json.loads(src.data), f"восстановление из версии {version}")
    db.commit()
    return SaveOut(version=ver.version, saved_at=ver.saved_at.isoformat())


@router.get("/export")
def export_workspace(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Скачать весь кабинет как JSON (право пользователя на свои данные)."""
    ws = _get_workspace(db, user)
    db.commit()
    latest = _latest_version(db, ws)
    data = json.loads(latest.data) if latest else {}
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": 'attachment; filename="svoyakniga-backup.json"'},
    )
