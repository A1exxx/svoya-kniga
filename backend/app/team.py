"""Команда и доступы (режим «обслуживающая бухгалтерия»).

Владелец кабинета создаёт приглашение-код с ролью (бухгалтер/просмотр),
коллега вводит код у себя — и получает доступ к кабинету. Владелец видит
участников, меняет роли и отзывает доступ. Все действия пишутся в audit_log.
"""
from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .auth import current_user
from .db import get_db
from .models import (
    ROLE_ACCOUNTANT,
    ROLE_OWNER,
    ROLE_VIEWER,
    AuditLog,
    Invite,
    Membership,
    User,
    Workspace,
    utcnow,
)
from .sync import resolve_workspace

router = APIRouter(prefix="/api/team", tags=["team"])

INVITE_TTL_DAYS = 7
# Код без похожих символов (0/O, 1/I/L) — диктуется по телефону без ошибок.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _make_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _require_owner(db: DbSession, user: User, ws_id: int | None) -> Workspace:
    ws, role = resolve_workspace(db, user, ws_id)
    if role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Только владелец кабинета")
    return ws


def _log(db: DbSession, user: User, action: str, detail: str) -> None:
    db.add(AuditLog(user_id=user.id, action=action, detail=detail[:512]))


class InviteIn(BaseModel):
    role: str = Field(default=ROLE_ACCOUNTANT)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


class RoleIn(BaseModel):
    role: str


@router.get("/members")
def list_members(
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Участники кабинета (видят все участники, не только владелец)."""
    wsp, my_role = resolve_workspace(db, user, ws)
    rows = db.scalars(select(Membership).where(Membership.workspace_id == wsp.id)).all()
    members = []
    for m in rows:
        u = db.get(User, m.user_id)
        if u is None:
            continue
        members.append(
            {
                "user_id": u.id,
                "email": u.email,
                "name": u.name,
                "role": ROLE_OWNER if wsp.user_id == u.id else m.role,
                "me": u.id == user.id,
                "since": m.created_at.isoformat(),
            }
        )
    members.sort(key=lambda x: (x["role"] != ROLE_OWNER, x["email"]))
    return {"workspace_id": wsp.id, "my_role": my_role, "members": members}


@router.post("/invite")
def create_invite(
    body: InviteIn,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Создать код-приглашение (только владелец). Код живёт 7 дней, одноразовый."""
    if body.role not in (ROLE_ACCOUNTANT, ROLE_VIEWER):
        raise HTTPException(status_code=422, detail="Роль: accountant или viewer")
    wsp = _require_owner(db, user, ws)
    code = _make_code()
    inv = Invite(
        workspace_id=wsp.id,
        code=code,
        role=body.role,
        created_by=user.id,
        expires_at=utcnow() + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(inv)
    _log(db, user, "team.invite", f"ws={wsp.id} role={body.role} code={code}")
    db.commit()
    return {"code": code, "role": body.role, "expires_at": inv.expires_at.isoformat()}


@router.get("/invites")
def list_invites(
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Активные (не использованные и не истёкшие) приглашения — владельцу."""
    wsp = _require_owner(db, user, ws)
    now = utcnow()
    rows = db.scalars(
        select(Invite).where(
            Invite.workspace_id == wsp.id,
            Invite.used_by.is_(None),
            Invite.expires_at > now,
        )
    ).all()
    return {
        "invites": [
            {"code": i.code, "role": i.role, "expires_at": i.expires_at.isoformat()} for i in rows
        ]
    }


@router.post("/join")
def join_by_code(body: JoinIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Присоединиться к чужому кабинету по коду приглашения."""
    code = body.code.strip().upper()
    inv = db.scalar(select(Invite).where(Invite.code == code))
    if inv is None or inv.used_by is not None or inv.expires_at <= utcnow():
        raise HTTPException(status_code=404, detail="Код не найден, использован или истёк")
    ws = db.get(Workspace, inv.workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Кабинет приглашения не найден")
    if ws.user_id == user.id:
        raise HTTPException(status_code=409, detail="Это ваш собственный кабинет")
    existing = db.scalar(
        select(Membership).where(Membership.workspace_id == ws.id, Membership.user_id == user.id)
    )
    if existing is not None:
        existing.role = inv.role  # повторный код — обновляет роль
    else:
        db.add(Membership(workspace_id=ws.id, user_id=user.id, role=inv.role))
    inv.used_by = user.id
    inv.used_at = utcnow()
    _log(db, user, "team.join", f"ws={ws.id} role={inv.role}")
    db.commit()
    owner = db.get(User, ws.user_id)
    return {
        "workspace_id": ws.id,
        "name": ws.name,
        "role": inv.role,
        "owner_email": owner.email if owner else "",
    }


@router.patch("/members/{member_user_id}")
def change_role(
    member_user_id: int,
    body: RoleIn,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Сменить роль участника (только владелец; себя-владельца менять нельзя)."""
    if body.role not in (ROLE_ACCOUNTANT, ROLE_VIEWER):
        raise HTTPException(status_code=422, detail="Роль: accountant или viewer")
    wsp = _require_owner(db, user, ws)
    if member_user_id == wsp.user_id:
        raise HTTPException(status_code=409, detail="Владельцу роль не меняется")
    m = db.scalar(
        select(Membership).where(
            Membership.workspace_id == wsp.id, Membership.user_id == member_user_id
        )
    )
    if m is None:
        raise HTTPException(status_code=404, detail="Участник не найден")
    m.role = body.role
    _log(db, user, "team.role", f"ws={wsp.id} user={member_user_id} role={body.role}")
    db.commit()
    return {"ok": True, "role": m.role}


@router.delete("/members/{member_user_id}")
def remove_member(
    member_user_id: int,
    ws: int | None = Query(default=None),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    """Отозвать доступ (владелец — любого; участник может выйти сам)."""
    wsp, my_role = resolve_workspace(db, user, ws)
    if member_user_id == wsp.user_id:
        raise HTTPException(status_code=409, detail="Владельца удалить нельзя")
    if my_role != ROLE_OWNER and member_user_id != user.id:
        raise HTTPException(status_code=403, detail="Только владелец удаляет других")
    m = db.scalar(
        select(Membership).where(
            Membership.workspace_id == wsp.id, Membership.user_id == member_user_id
        )
    )
    if m is None:
        raise HTTPException(status_code=404, detail="Участник не найден")
    db.delete(m)
    _log(db, user, "team.remove", f"ws={wsp.id} user={member_user_id}")
    db.commit()
    return {"ok": True}
