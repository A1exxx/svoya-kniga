"""Тесты аккаунтов и версионируемого хранилища рабочего стола.

Используют отдельную временную SQLite-базу (override get_db), чтобы не
трогать рабочую БД.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401 — регистрация моделей
from app.auth import reset_rate_limit
from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def client(tmp_path):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(url, connect_args={"check_same_thread": False}, future=True)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    reset_rate_limit()
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


def _register(client, email="buh@example.com", password="parol12345", name="Бухгалтер"):
    return client.post("/api/auth/register", json={"email": email, "password": password, "name": name})


def test_register_and_me(client):
    r = _register(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "buh@example.com"
    assert body["name"] == "Бухгалтер"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "buh@example.com"


def test_duplicate_email_rejected(client):
    assert _register(client).status_code == 200
    r2 = _register(client)
    assert r2.status_code == 409


def test_login_wrong_then_right(client):
    _register(client)
    client.post("/api/auth/logout")
    bad = client.post("/api/auth/login", json={"email": "buh@example.com", "password": "wrong"})
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"email": "buh@example.com", "password": "parol12345"})
    assert ok.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_unauthorized_workspace(client):
    # без входа
    assert client.get("/api/workspace").status_code == 401


def test_save_get_versions_restore(client):
    _register(client)
    # пустой рабочий стол
    g0 = client.get("/api/workspace")
    assert g0.status_code == 200
    assert g0.json()["version"] == 0

    # сохранение v1
    r1 = client.put("/api/workspace", json={"data": {"orgs": [{"id": "a", "name": "ИП 1"}]}, "note": "первое"})
    assert r1.status_code == 200
    assert r1.json()["version"] == 1

    g1 = client.get("/api/workspace")
    assert g1.json()["version"] == 1
    assert g1.json()["data"]["orgs"][0]["name"] == "ИП 1"

    # сохранение v2 (изменение)
    r2 = client.put("/api/workspace", json={"data": {"orgs": [{"id": "a", "name": "ИП 1 ред."}]}})
    assert r2.json()["version"] == 2

    # список версий — 2, текущая 2
    lv = client.get("/api/workspace/versions").json()
    assert lv["current"] == 2
    assert [v["version"] for v in lv["versions"]] == [2, 1]

    # получить старую версию
    v1 = client.get("/api/workspace/versions/1").json()
    assert v1["data"]["orgs"][0]["name"] == "ИП 1"

    # откат к v1 → создаётся НОВАЯ версия 3 с данными v1
    rr = client.post("/api/workspace/restore/1")
    assert rr.json()["version"] == 3
    cur = client.get("/api/workspace").json()
    assert cur["version"] == 3
    assert cur["data"]["orgs"][0]["name"] == "ИП 1"  # вернулись данные v1

    # экспорт
    ex = client.get("/api/workspace/export")
    assert ex.status_code == 200
    assert ex.json()["orgs"][0]["name"] == "ИП 1"


def test_rate_limit_after_5_fails(client):
    _register(client)
    client.post("/api/auth/logout")
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "buh@example.com", "password": "wrong"})
    blocked = client.post("/api/auth/login", json={"email": "buh@example.com", "password": "wrong"})
    assert blocked.status_code == 429


def test_workspace_version_has_unique_constraint():
    # Гарантия от дубля версий при конкурентном сохранении (P0-фикс).
    from app.models import WorkspaceVersion

    names = {c.name for c in WorkspaceVersion.__table__.constraints if c.name}
    assert "uq_ws_version" in names


def test_data_isolated_between_users(client):
    _register(client, email="a@example.com")
    client.put("/api/workspace", json={"data": {"secret": "A"}})
    client.post("/api/auth/logout")
    _register(client, email="b@example.com")
    g = client.get("/api/workspace")
    # у нового пользователя — пустой стол, чужие данные недоступны
    assert g.json()["version"] == 0
