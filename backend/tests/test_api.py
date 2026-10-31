import os

os.environ["APP_MODE"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
from fastapi.testclient import TestClient
from app.main import app, engine, user
from sqlalchemy import text
import pytest


@pytest.fixture
def client():
    with engine.begin() as c:
        c.execute(text("DELETE FROM records"))
        c.execute(text("DELETE FROM beta_invitations"))
        c.execute(text("DELETE FROM beta_members"))
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def base():
    return {
        "facts": {"employer": "Example", "title": "Engineer"},
        "skills": ["Python"],
        "bullets": [{"id": "b1", "text": "Supported 5 engineers using Python."}],
    }


def consent(client):
    assert (
        client.post("/api/preferences", json={"resume_consent": True}).status_code
        == 200
    )


def test_job_lifecycle_and_duplicate(client):
    client.post(
        "/api/preferences",
        json={"role": "Engineer", "location": "Delhi", "skills": ["Python", "SQL"]},
    )
    job = {
        "title": "Engineer",
        "company": "Example",
        "location": "Delhi",
        "description": "Build services in Python and SQL",
        "url": "https://example.com/jobs/1",
    }
    response = client.post("/api/jobs", json=job)
    assert response.status_code == 201
    record = response.json()
    assert record["score"] == 100 and record["stage"] == "Ready to Apply"
    assert client.post("/api/jobs", json=job).status_code == 409
    assert (
        client.patch(
            "/api/jobs/" + record["id"], json={"stage": "Interview"}
        ).status_code
        == 200
    )
    assert client.get("/api/state").json()["jobs"][0]["stage"] == "Interview"
    client.post("/api/preferences", json={"skills": ["Java"]})
    assert client.get("/api/state").json()["jobs"][0]["stage"] == "Interview"


def test_tenant_isolation(client):
    consent(client)
    resume = client.post("/api/resumes", json=base()).json()
    job = client.post(
        "/api/jobs",
        json={
            "title": "Engineer",
            "company": "Example",
            "description": "Python engineering role",
            "url": "https://example.com/j",
        },
    ).json()
    app.dependency_overrides[user] = lambda: "other-user"
    assert client.get("/api/state").json()["jobs"] == []
    assert (
        client.patch("/api/jobs/" + job["id"], json={"stage": "Offer"}).status_code
        == 404
    )
    consent(client)
    assert (
        client.post(
            "/api/resumes/validate", json={"base_id": resume["id"], "draft": base()}
        ).status_code
        == 404
    )
    client.delete("/api/data")
    app.dependency_overrides.clear()
    assert len(client.get("/api/state").json()["jobs"]) == 1


def test_resume_consent_versioning_and_validation(client):
    assert client.post("/api/resumes", json=base()).status_code == 403
    consent(client)
    first = client.post("/api/resumes", json=base()).json()
    assert first["version"] == 1
    assert client.post("/api/resumes", json=base()).json()["version"] == 2
    result = client.post(
        "/api/resumes/validate", json={"base_id": first["id"], "draft": base()}
    ).json()
    assert result["passed"]
    draft = base()
    draft["bullets"][0]["text"] = "Supported 50 engineers using Python."
    result = client.post(
        "/api/resumes/validate", json={"base_id": first["id"], "draft": draft}
    ).json()
    assert not result["passed"] and any("numbers" in s for s in result["violations"])


def test_upload_rules_and_docx_extraction(client):
    assert (
        client.post(
            "/api/resumes/extract", files={"file": ("a.txt", b"test")}
        ).status_code
        == 403
    )
    consent(client)
    assert (
        client.post(
            "/api/resumes/extract", files={"file": ("a.txt", b"test")}
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/resumes/extract", files={"file": ("a.pdf", b"bad pdf")}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/resumes/extract",
            files={"file": ("a.pdf", b"x" * (5 * 1024 * 1024 + 1))},
        ).status_code
        == 413
    )
    from docx import Document
    from io import BytesIO

    doc = Document()
    for line in [
        "Alex Example",
        "Experience",
        "Engineer | Example Labs | 2022–2025",
        "• Built 5 Python services.",
        "Skills",
        "Python, SQL",
    ]:
        doc.add_paragraph(line)
    stream = BytesIO()
    doc.save(stream)
    result = client.post(
        "/api/resumes/extract", files={"file": ("a.docx", stream.getvalue())}
    )
    assert result.status_code == 200 and "Python" in result.json()["text"]
    assert result.json()["draft"]["skills"] == ["Python", "SQL"]
    assert result.json()["draft"]["bullets"][0]["text"] == "Built 5 Python services."
    assert client.get("/api/state").json()["resumes"] == []


def test_filters_and_deletion(client):
    client.post(
        "/api/preferences",
        json={
            "role": "Designer",
            "location": "Mumbai",
            "blocked_companies": ["Blocked"],
        },
    )
    for company in ["Example", "Blocked"]:
        client.post(
            "/api/jobs",
            json={
                "title": "Engineer",
                "company": company,
                "location": "Mumbai",
                "description": "Engineering role in Python",
                "url": "https://example.com/" + company,
            },
        )
    state = client.get("/api/state").json()
    assert len(state["jobs"]) == 1 and state["jobs"][0]["stage"] == "Near Misses"
    assert client.delete("/api/data").status_code == 204
    state = client.get("/api/state").json()
    assert not state["jobs"] and not state["resumes"] and not state["activity"]


def test_production_fails_closed():
    import subprocess, sys

    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        env={
            **os.environ,
            "APP_MODE": "production",
            "DATABASE_URL": "sqlite:///:memory:",
        },
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0 and "Production requires PostgreSQL" in result.stderr


def test_real_jwt_verification_and_invite_enforcement(client, monkeypatch):
    import app.main as main
    import jwt
    from datetime import datetime, timedelta, timezone
    from cryptography.hazmat.primitives.asymmetric import rsa
    from types import SimpleNamespace

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(main, "MODE", "production")
    monkeypatch.setattr(
        main,
        "jwks",
        SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())
        ),
    )
    monkeypatch.setenv("INVITED_EMAILS", "invited@example.com")
    main.access_store.seed_legacy(["invited@example.com"])
    claims = {
        "amr": [{"method": "otp"}],
        "sub": "user-id",
        "email": "invited@example.com",
        "aud": "authenticated",
        "iss": main.issuer,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    token = jwt.encode(claims, key, algorithm="RS256")
    assert (
        client.get(
            "/api/state", headers={"Authorization": "Bearer " + token}
        ).status_code
        == 200
    )
    assert client.get("/api/state").status_code == 401
    for update, status in [
        ({"email": "outsider@example.com"}, 403),
        ({"aud": "wrong"}, 401),
        ({"exp": 0}, 401),
        ({"iss": "https://wrong.example"}, 401),
    ]:
        token = jwt.encode({**claims, **update}, key, algorithm="RS256")
        assert (
            client.get(
                "/api/state", headers={"Authorization": "Bearer " + token}
            ).status_code
            == status
        )


def test_multiple_preferences_match_alternatives_and_normalize(client):
    response = client.post(
        "/api/preferences",
        json={
            "roles": [" Engineer ", "Designer", "engineer", " "],
            "locations": ["Delhi", "Mumbai"],
            "skills": ["Python"],
        },
    )
    assert response.status_code == 200
    assert response.json()["roles"] == ["Engineer", "Designer"]
    assert client.get("/api/state").json()["preferences"]["locations"] == [
        "Delhi",
        "Mumbai",
    ]
    for index, (title, location, stage) in enumerate(
        [
            ("Engineer", "Delhi", "Ready to Apply"),
            ("Designer", "Mumbai", "Ready to Apply"),
            ("Designer", "Chennai", "Near Misses"),
            ("Accountant", "Chennai", "Archived"),
        ]
    ):
        result = client.post(
            "/api/jobs",
            json={
                "title": title,
                "company": "Example",
                "location": location,
                "description": "Work with Python services",
                "url": f"https://example.com/multi/{index}",
            },
        ).json()
        assert result["stage"] == stage
    assert (
        client.post("/api/preferences", json={"roles": ["x"] * 21}).status_code == 422
    )


def test_legacy_preferences_preserved(client):
    from app.main import add

    add("local-demo", "preferences", {"role": "Engineer", "location": "Delhi"})
    preferences = client.get("/api/state").json()["preferences"]
    assert preferences["roles"] == ["Engineer"]
    assert preferences["locations"] == ["Delhi"]
    assert (
        client.post("/api/preferences", json={"roles": [], "locations": []}).json()[
            "roles"
        ]
        == []
    )


def test_applied_marker_persists_and_cannot_be_applied_twice(client):
    job = client.post(
        "/api/jobs",
        json={
            "title": "Engineer",
            "company": "Example",
            "description": "Python engineering role",
            "url": "https://example.com/applied",
        },
    ).json()
    path = "/api/jobs/" + job["id"]
    first = client.patch(path, json={"stage": "Applied (Manual)"})
    assert first.status_code == 200
    timestamp = first.json()["applied_at"]
    assert timestamp
    assert client.patch(path, json={"stage": "Applied (Manual)"}).status_code == 409
    client.patch(path, json={"stage": "Interview"})
    assert client.get("/api/state").json()["jobs"][0]["applied_at"] == timestamp
    client.patch(path, json={"stage": "Archived"})
    assert client.patch(path, json={"stage": "Applied (Manual)"}).status_code == 409
