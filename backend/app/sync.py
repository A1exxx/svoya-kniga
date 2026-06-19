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
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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


def _persist_version(db: DbSession, ws: Workspace, data: dict, note: str) -> tuple[int, str]:
    """Сохранить новую ревизию атомарно и устойчиво к гонке (две вкладки/устройства).

    Номер версии берём из max(version) в БД (не из ws.current_version, который мог
    устареть). UniqueConstraint(workspace_id, version) гарантирует отсутствие дублей:
    при конкуренции одна вставка падает IntegrityError → откат и повтор с новым
    номером. Так обе ревизии сохраняются (v6 и v7), ни одна не теряется."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    size = len(payload.encode("utf-8"))
    if size > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Слишком большой документ (>8 МБ)")
    for _ in range(6):
        nextv = (
            db.scalar(
                select(func.max(WorkspaceVersion.version)).where(
                    WorkspaceVersion.workspace_id == ws.id
                )
            )
            or 0
        ) + 1
        saved = utcnow()
        db.add(
            WorkspaceVersion(
                workspace_id=ws.id, version=nextv, data=payload, size_bytes=size, note=note[:255], saved_at=saved
            )
        )
        ws.current_version = nextv
        ws.updated_at = saved
        try:
            db.commit()
            return nextv, saved.isoformat()
        except IntegrityError:
            db.rollback()
            db.refresh(ws)
            continue
    raise HTTPException(status_code=409, detail="Конфликт сохранения, повторите попытку")


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
    db.commit()  # зафиксировать возможный авто-создан ws перед расчётом версии
    version, saved = _persist_version(db, ws, body.data, body.note)
    return SaveOut(version=version, saved_at=saved)


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
    data = json.loads(src.data)
    new_v, saved = _persist_version(db, ws, data, f"восстановление из версии {version}")
    return SaveOut(version=new_v, saved_at=saved)


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
