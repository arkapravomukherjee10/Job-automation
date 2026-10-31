import os

os.environ["APP_MODE"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import text
import app.main as main
from app.access import OWNER_EMAIL, AccessStore, Identity


@pytest.fixture
def auth_client(monkeypatch):
    with main.engine.begin() as c:
        for table in ["records", "beta_invitations", "beta_members"]:
            c.execute(text(f"DELETE FROM {table}"))
    main.app.dependency_overrides.clear()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(main, "MODE", "production")
    monkeypatch.setattr(
        main,
        "jwks",
        SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())
        ),
    )

    def headers(email, **extra):
        claims = {
            "sub": email,
            "email": email,
            "aud": "authenticated",
            "iss": main.issuer,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            "amr": [{"method": "otp"}],
            **extra,
        }
        return {"Authorization": "Bearer " + jwt.encode(claims, key, algorithm="RS256")}

    with TestClient(main.app) as client:
        yield client, headers
    main.app.dependency_overrides.clear()


def test_only_verified_owner_can_manage_access(auth_client):
    c, h = auth_client
    assert c.get("/api/admin/users").status_code == 401
    owner = h(OWNER_EMAIL.upper())
    assert c.get("/api/access", headers=owner).json()["is_admin"]
    assert c.get("/api/admin/users", headers=owner).status_code == 200
    outsider = h(
        "outsider@example.com", user_metadata={"is_admin": True, "email": OWNER_EMAIL}
    )
    for path in ["/api/admin/users", "/api/state"]:
        assert c.get(path, headers=outsider).status_code == 403
    for path in ["/api/admin/invitations", "/api/admin/invitations/revoke"]:
        assert (
            c.post(
                path, headers=outsider, json={"email": "other@example.com"}
            ).status_code
            == 403
        )
    unverified = h(
        OWNER_EMAIL,
        amr=[{"method": "password"}],
        user_metadata={"email_verified": True},
    )
    assert c.get("/api/admin/users", headers=unverified).status_code == 403
    assert (
        c.post(
            "/api/admin/invitations/revoke", headers=owner, json={"email": OWNER_EMAIL}
        ).status_code
        == 400
    )


def test_invite_signup_revoke_and_restore_existing_session(auth_client):
    c, h = auth_client
    owner, tester = h(OWNER_EMAIL), h("tester@example.com")
    assert not c.get("/api/access", headers=tester).json()["allowed"]
    assert c.get("/api/state", headers=tester).status_code == 403
    assert (
        c.post(
            "/api/admin/invitations",
            headers=owner,
            json={"email": " Tester@Example.com "},
        ).status_code
        == 201
    )
    assert c.get("/api/access", headers=tester).json()["allowed"]
    assert c.get("/api/state", headers=tester).status_code == 200
    c.post(
        "/api/jobs",
        headers=tester,
        json={
            "title": "Engineer",
            "company": "Example",
            "description": "Python engineering role",
            "url": "https://example.com/job",
        },
    )
    assert c.get("/api/state", headers=owner).json()["jobs"] == []
    data = c.get("/api/admin/users", headers=owner).json()
    assert (
        len(data["members"]) == 1
        and data["members"][0]["email"] == "tester@example.com"
    )
    first = data["members"][0]["signed_up_at"]
    c.get("/api/access", headers=tester)
    assert (
        c.get("/api/admin/users", headers=owner).json()["members"][0]["signed_up_at"]
        == first
    )
    assert (
        c.post(
            "/api/admin/invitations/revoke",
            headers=owner,
            json={"email": "tester@example.com"},
        ).status_code
        == 200
    )
    assert c.get("/api/state", headers=tester).status_code == 403
    assert c.post("/api/preferences", headers=tester, json={}).status_code == 403
    assert not c.get("/api/access", headers=tester).json()["allowed"]
    main.access_store.seed_legacy(["tester@example.com"])
    assert c.get("/api/state", headers=tester).status_code == 403
    c.post(
        "/api/admin/invitations", headers=owner, json={"email": "tester@example.com"}
    )
    assert len(c.get("/api/state", headers=tester).json()["jobs"]) == 1


def test_email_validation_and_no_client_role_escalation(auth_client):
    c, h = auth_client
    owner = h(OWNER_EMAIL)
    for email in ["bad", "a@", "name @example.com", "x" * 255 + "@example.com"]:
        assert (
            c.post(
                "/api/admin/invitations", headers=owner, json={"email": email}
            ).status_code
            == 422
        )
    c.post(
        "/api/admin/invitations",
        headers=owner,
        json={"email": "person@example.com", "is_admin": True},
    )
    person = h("person@example.com")
    assert not c.get("/api/access", headers=person).json()["is_admin"]
    assert c.get("/api/admin/users", headers=person).status_code == 403


def test_normalized_invitations_persist_and_are_unique(auth_client):
    c, h = auth_client
    for email in ["test@example.com", "TEST@EXAMPLE.COM"]:
        assert (
            c.post(
                "/api/admin/invitations", headers=h(OWNER_EMAIL), json={"email": email}
            ).status_code
            == 201
        )
    assert AccessStore(main.engine).allowed(Identity("test", "test@example.com"))
    assert (
        len(c.get("/api/admin/users", headers=h(OWNER_EMAIL)).json()["invitations"])
        == 1
    )
