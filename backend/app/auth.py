"""Аутентификация: регистрация, вход, выход, текущий пользователь.

Сессия — opaque-токен в httpOnly-cookie (защита от XSS) + серверная таблица
sessions (мгновенный отзыв при выходе). Защита от перебора — простой
in-memory лимит попыток входа.
"""
from __future__ import annotations

import os
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import AuditLog, Session, User, Workspace, utcnow
from .security import hash_password, new_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "svk_session"
SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "14"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")  # lax | none (none → требует Secure)

# --- Простой anti-bruteforce (in-memory, на один процесс) ---
_MAX_FAILS = 5
_WINDOW_S = 15 * 60
_fails: dict[str, list[float]] = {}


def _too_many_fails(email: str) -> bool:
    now = time.time()
    attempts = [t for t in _fails.get(email, []) if now - t < _WINDOW_S]
    _fails[email] = attempts
    return len(attempts) >= _MAX_FAILS


def _record_fail(email: str) -> None:
    _fails.setdefault(email, []).append(time.time())


def _clear_fails(email: str) -> None:
    _fails.pop(email, None)


def reset_rate_limit() -> None:
    """Для тестов."""
    _fails.clear()


# --- Схемы ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=255)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    name: str


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_DAYS * 86400,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def _create_session(db: DbSession, user: User, request: Request) -> str:
    token = new_session_token()
    db.add(
        Session(
            token=token,
            user_id=user.id,
            user_agent=(request.headers.get("user-agent", "") or "")[:255],
            expires_at=utcnow() + timedelta(days=SESSION_TTL_DAYS),
        )
    )
    return token


def current_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    """Зависимость: пользователь из cookie-сессии, иначе 401."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    sess = db.scalar(select(Session).where(Session.token == token))
    if sess is None or sess.expires_at <= utcnow():
        raise HTTPException(status_code=401, detail="Сессия истекла")
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


@router.post("/register", response_model=UserOut)
def register(body: RegisterIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже есть")
    user = User(email=email, password_hash=hash_password(body.password), name=body.name.strip())
    db.add(user)
    db.flush()  # получить user.id
    db.add(Workspace(user_id=user.id, name="Мой кабинет"))
    token = _create_session(db, user, request)
    db.add(AuditLog(user_id=user.id, action="register", detail=email))
    db.commit()
    _set_session_cookie(response, token)
    return UserOut(id=user.id, email=user.email, name=user.name)


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    email = body.email.lower().strip()
    if _too_many_fails(email):
        raise HTTPException(status_code=429, detail="Слишком много попыток входа. Подождите 15 минут.")
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(user.password_hash, body.password):
        _record_fail(email)
        db.add(AuditLog(user_id=user.id if user else None, action="login_fail", detail=email))
        db.commit()
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    _clear_fails(email)
    token = _create_session(db, user, request)
    db.add(AuditLog(user_id=user.id, action="login", detail=email))
    db.commit()
    _set_session_cookie(response, token)
    return UserOut(id=user.id, email=user.email, name=user.name)


@router.post("/logout")
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        sess = db.scalar(select(Session).where(Session.token == token))
        if sess:
            db.delete(sess)
            db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut(id=user.id, email=user.email, name=user.name)
