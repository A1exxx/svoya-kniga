"""Тесты мультипользовательского режима (команда, роли, приглашения).

Сценарий обслуживающей бухгалтерии: владелец кабинета приглашает бухгалтера
(полный доступ) и помощника (только просмотр); проверяем список кабинетов,
права на сохранение и отзыв доступа.
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


def _register(client, email, password="parol12345", name=""):
    r = client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
    assert r.status_code == 200, r.text
    return r


def _login(client, email, password="parol12345"):
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def _owner_ws_id(client) -> int:
    r = client.get("/api/workspace/list")
    assert r.status_code == 200, r.text
    own = [w for w in r.json()["workspaces"] if w["own"]]
    assert own, "у владельца должен быть свой кабинет"
    return own[0]["id"]


def test_invite_join_and_roles(client):
    # Владелец: сохраняет данные, создаёт приглашения для бухгалтера и просмотра.
    _register(client, "owner@example.com", name="Владелец")
    r = client.put("/api/workspace", json={"data": {"orgs": [{"name": "ИП Тест"}]}, "note": "старт"})
    assert r.status_code == 200
    ws_id = _owner_ws_id(client)

    inv_acc = client.post("/api/team/invite", json={"role": "accountant"})
    assert inv_acc.status_code == 200, inv_acc.text
    code_acc = inv_acc.json()["code"]
    inv_view = client.post("/api/team/invite", json={"role": "viewer"})
    code_view = inv_view.json()["code"]
    # Активные приглашения видны владельцу
    lst = client.get("/api/team/invites").json()["invites"]
    assert {i["code"] for i in lst} == {code_acc, code_view}

    # Бухгалтер: входит по коду, видит кабинет, может сохранять.
    _register(client, "buh@example.com", name="Бухгалтер")
    j = client.post("/api/team/join", json={"code": code_acc})
    assert j.status_code == 200, j.text
    assert j.json()["workspace_id"] == ws_id
    lstw = client.get("/api/workspace/list").json()["workspaces"]
    roles = {w["id"]: w["role"] for w in lstw}
    assert roles[ws_id] == "accountant"
    got = client.get(f"/api/workspace?ws={ws_id}")
    assert got.status_code == 200
    assert got.json()["data"]["orgs"][0]["name"] == "ИП Тест"
    save = client.put(f"/api/workspace?ws={ws_id}", json={"data": {"orgs": []}, "note": "правка бухгалтера"})
    assert save.status_code == 200
    # Автор фиксируется в заметке ревизии
    vers = client.get(f"/api/workspace/versions?ws={ws_id}").json()["versions"]
    assert any("buh@example.com" in v["note"] for v in vers)

    # Просмотр: читает, но сохранить не может (403).
    _register(client, "viewer@example.com", name="Помощник")
    j2 = client.post("/api/team/join", json={"code": code_view})
    assert j2.status_code == 200
    got2 = client.get(f"/api/workspace?ws={ws_id}")
    assert got2.status_code == 200
    assert got2.json()["role"] == "viewer"
    denied = client.put(f"/api/workspace?ws={ws_id}", json={"data": {}, "note": "попытка"})
    assert denied.status_code == 403
    denied_restore = client.post(f"/api/workspace/restore/1?ws={ws_id}")
    assert denied_restore.status_code == 403


def test_invite_is_single_use_and_owner_only(client):
    _register(client, "owner2@example.com")
    code = client.post("/api/team/invite", json={"role": "accountant"}).json()["code"]

    _register(client, "a@example.com")
    assert client.post("/api/team/join", json={"code": code}).status_code == 200
    # Повторное использование того же кода другим пользователем — отказ.
    _register(client, "b@example.com")
    assert client.post("/api/team/join", json={"code": code}).status_code == 404
    # Не-владелец не может приглашать в чужой кабинет.
    _login(client, "a@example.com")
    ws_owner = [w for w in client.get("/api/workspace/list").json()["workspaces"] if not w["own"]][0]["id"]
    r = client.post(f"/api/team/invite?ws={ws_owner}", json={"role": "viewer"})
    assert r.status_code == 403


def test_change_role_and_remove_member(client):
    _register(client, "owner3@example.com")
    code = client.post("/api/team/invite", json={"role": "viewer"}).json()["code"]
    _register(client, "emp@example.com")
    ws_id = client.post("/api/team/join", json={"code": code}).json()["workspace_id"]
    # viewer не может писать
    assert client.put(f"/api/workspace?ws={ws_id}", json={"data": {}}).status_code == 403

    # Владелец повышает роль до accountant → запись работает.
    _login(client, "owner3@example.com")
    members = client.get("/api/team/members").json()["members"]
    emp_id = [m for m in members if m["email"] == "emp@example.com"][0]["user_id"]
    ok = client.patch(f"/api/team/members/{emp_id}", json={"role": "accountant"})
    assert ok.status_code == 200
    _login(client, "emp@example.com")
    assert client.put(f"/api/workspace?ws={ws_id}", json={"data": {"x": 1}}).status_code == 200

    # Владелец отзывает доступ → кабинет пропадает.
    _login(client, "owner3@example.com")
    assert client.delete(f"/api/team/members/{emp_id}").status_code == 200
    _login(client, "emp@example.com")
    assert client.get(f"/api/workspace?ws={ws_id}").status_code == 403


def test_stranger_has_no_access(client):
    _register(client, "owner4@example.com")
    client.put("/api/workspace", json={"data": {"secret": True}})
    ws_id = _owner_ws_id(client)
    _register(client, "stranger@example.com")
    assert client.get(f"/api/workspace?ws={ws_id}").status_code == 403
    assert client.put(f"/api/workspace?ws={ws_id}", json={"data": {}}).status_code == 403
    assert client.get(f"/api/team/members?ws={ws_id}").status_code == 403
