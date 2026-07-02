"""Синхронизация рабочего стола: загрузка/сохранение с историей версий.

Каждое сохранение — новая неизменяемая ревизия (workspace_versions). Это и есть
многослойная защита «чтобы ничего не потерялось»: можно посмотреть список
версий и откатиться к любой. Формат data — тот же JSON, что локальный
бэкап фронтенда (весь кабинет: ИП, операции, документы, сотрудники).

V2 (мультипользовательский режим): к одному рабочему столу имеют доступ
несколько пользователей через memberships с ролями (owner/accountant/viewer).
Все эндпоинты принимают ?ws=<id>; без него — «свой» кабинет (владелец).
Роль viewer — только чтение: save/restore отклоняются с 403.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth import current_user
from .db import get_db
from .models import (
    ROLE_ACCOUNTANT,
    ROLE_OWNER,
    ROLE_VIEWER,
    Membership,
    User,
    Workspace,
    WorkspaceVersion,
    utcnow,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# Защита от чрезмерно больших документов (картинки логотипов/печатей внутри JSON).
MAX_DOC_BYTES = 8 * 1024 * 1024  # 8 МБ


def _own_workspace(db: DbSession, user: User) -> Workspace:
    """«Свой» кабинет пользователя (создаётся при первом обращении) + membership owner."""
    ws = db.scalar(select(Workspace).where(Workspace.user_id == user.id).order_by(Workspace.id))
    if ws is None:
        ws = Workspace(user_id=user.id, name="Мой кабинет")
        db.add(ws)
        db.flush()
    m = db.scalar(
        select(Membership).where(Membership.workspace_id == ws.id, Membership.user_id == user.id)
    )
    if m is None:
        db.add(Membership(workspace_id=ws.id, user_id=user.id, role=ROLE_OWNER))
        db.flush()
    return ws


def resolve_workspace(
    db: DbSession, user: User, ws_id: int | None, *, write: bool = False
) -> tuple[Workspace, str]:
    """Кабинет + роль пользователя в нём. write=True требует роль owner/accountant."""
    if ws_id is None:
        ws = _own_workspace(db, user)
        db.commit()
        return ws, ROLE_OWNER
    ws = db.get(Workspace, ws_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Кабинет не найден")
    # Владелец по полю user_id — всегда owner (даже без membership-строки).
    if ws.user_id == user.id:
        _own_workspace(db, user)
        db.commit()
        return ws, ROLE_OWNER
    m = db.scalar(
        select(Membership).where(Membership.workspace_id == ws.id, Membership.user_id == user.id)
    )
    if m is None:
        raise HTTPException(status_code=403, detail="Нет доступа к этому кабинету")
    if write and m.role == ROLE_VIEWER:
        raise HTTPException(status_code=403, detail="Роль «просмотр» — сохранение запрещено")
    return ws, m.role


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


@router.get("/list")
def list_workspaces(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Все кабинеты, доступные пользователю (свой + куда пригласили), с ролью."""
    own = _own_workspace(db, user)
    db.commit()
    rows = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    out = []
    seen: set[int] = set()
    for m in rows:
        ws = db.get(Workspace, m.workspace_id)
        if ws is None or ws.id in seen:
            continue
        seen.add(ws.id)
        owner = db.get(User, ws.user_id)
        out.append(
            {
                "id": ws.id,
                "name": ws.name,
                "role": ROLE_OWNER if ws.user_id == user.id else m.role,
                "owner_email": owner.email if owner else "",
                "own": ws.id == own.id,
                "updated_at": ws.updated_at.isoformat(),
                "version": ws.current_version,
            }
        )
    out.sort(key=lambda x: (not x["own"], x["id"]))
    return {"workspaces": out}


@router.get("")
def get_workspace(
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    wsp, role = resolve_workspace(db, user, ws)
    latest = _latest_version(db, wsp)
    if latest is None:
        return {"version": 0, "data": None, "saved_at": None, "role": role, "workspace_id": wsp.id}
    return {
        "version": latest.version,
        "data": json.loads(latest.data),
        "saved_at": latest.saved_at.isoformat(),
        "role": role,
        "workspace_id": wsp.id,
    }


@router.put("", response_model=SaveOut)
def save_workspace(
    body: SaveIn,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    wsp, _role = resolve_workspace(db, user, ws, write=True)
    note = body.note or "автосохранение"
    # В заметке ревизии фиксируем автора — видно, КТО из бухгалтеров сохранил.
    note = f"{note} · {user.email}"
    version, saved = _persist_version(db, wsp, body.data, note)
    return SaveOut(version=version, saved_at=saved)


@router.get("/versions")
def list_versions(
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    wsp, _role = resolve_workspace(db, user, ws)
    rows = db.scalars(
        select(WorkspaceVersion)
        .where(WorkspaceVersion.workspace_id == wsp.id)
        .order_by(WorkspaceVersion.version.desc())
    ).all()
    return {
        "current": wsp.current_version,
        "versions": [
            {"version": v.version, "saved_at": v.saved_at.isoformat(), "size_bytes": v.size_bytes, "note": v.note}
            for v in rows
        ],
    }


@router.get("/versions/{version}")
def get_version(
    version: int,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    wsp, _role = resolve_workspace(db, user, ws)
    v = db.scalar(
        select(WorkspaceVersion).where(
            WorkspaceVersion.workspace_id == wsp.id, WorkspaceVersion.version == version
        )
    )
    if v is None:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    return {"version": v.version, "data": json.loads(v.data), "saved_at": v.saved_at.isoformat()}


@router.post("/restore/{version}", response_model=SaveOut)
def restore_version(
    version: int,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Откат: создаёт НОВУЮ версию с данными из старой (старые ревизии не трогаем)."""
    wsp, _role = resolve_workspace(db, user, ws, write=True)
    src = db.scalar(
        select(WorkspaceVersion).where(
            WorkspaceVersion.workspace_id == wsp.id, WorkspaceVersion.version == version
        )
    )
    if src is None:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    data = json.loads(src.data)
    new_v, saved = _persist_version(db, wsp, data, f"восстановление из версии {version} · {user.email}")
    return SaveOut(version=new_v, saved_at=saved)


@router.get("/export")
def export_workspace(
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Скачать весь кабинет как JSON (право пользователя на свои данные)."""
    wsp, _role = resolve_workspace(db, user, ws)
    latest = _latest_version(db, wsp)
    data = json.loads(latest.data) if latest else {}
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": 'attachment; filename="svoyakniga-backup.json"'},
    )
