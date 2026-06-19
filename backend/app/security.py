"""Безопасность: хеширование паролей (Argon2id) + opaque-токены сессий.

Argon2id — рекомендация OWASP 2025/2026. Параметры подобраны так, чтобы один
хеш занимал ~50–100 мс на типовом VPS (m=19456 КиБ, t=2, p=1).
"""
from __future__ import annotations

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerifyMismatchError

# m=19 МиБ, t=2, p=1 — профиль OWASP «19 MiB / 2 iters / 1 parallel».
_ph = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHash, Exception):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(password_hash)
    except Exception:
        return False


def new_session_token() -> str:
    """Криптостойкий токен сессии (для httpOnly-cookie)."""
    return secrets.token_urlsafe(48)
