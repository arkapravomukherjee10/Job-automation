import json
import time
from urllib.parse import urlparse, parse_qs

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.access import Identity
from app.gmail import GmailService, ConnectInput, CompleteInput, SCOPE, digest


@pytest.fixture
def service(monkeypatch):
    for key, value in {"APP_MODE": "development", "GOOGLE_CLIENT_ID": "test-client", "GOOGLE_CLIENT_SECRET": "test-secret", "GOOGLE_REDIRECT_URI": "http://localhost/api/gmail/callback", "GMAIL_ENCRYPTION_SECRET": "test-only-encryption-secret-not-real-123456", "FRONTEND_ORIGINS": "http://localhost:5173"}.items():
        monkeypatch.setenv(key, value)
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    return GmailService(engine)


def begin(service, owner="alice"):
    result = service.begin(Identity(owner, owner + "@example.com"), ConnectInput(browser_verifier="b" * 64, consent=True))
    params = parse_qs(urlparse(result["url"]).query)
    assert params["scope"] == [SCOPE]
    assert params["code_challenge_method"] == ["S256"]
    return params["state"][0]


def fake_google(method, url, **kwargs):
    if url.endswith("/token"):
        return {"access_token": "private-access", "refresh_token": "private-refresh", "scope": SCOPE, "expires_in": 3600}
    if url.endswith("/profile"):
        return {"emailAddress": "mailbox@example.com"}
    if url.endswith("/revoke"):
        return {}
    raise AssertionError(url)


def connect(service, monkeypatch, owner="alice"):
    monkeypatch.setattr(service, "request", fake_google)
    state = begin(service, owner)
    result = service.callback(state, "code", "")
    assert "#gmail_state=" in result.headers["location"]
    service.complete(owner, CompleteInput(state=state, browser_verifier="b" * 64))
    return state


def test_callback_requires_initiating_user_and_browser_and_is_single_use(service, monkeypatch):
    monkeypatch.setattr(service, "request", fake_google)
    state = begin(service)
    service.callback(state, "code", "")
    assert service.connection("alice") is None
    for owner, verifier in [("bob", "b" * 64), ("alice", "x" * 64)]:
        with pytest.raises(HTTPException):
            service.complete(owner, CompleteInput(state=state, browser_verifier=verifier))
    service.complete("alice", CompleteInput(state=state, browser_verifier="b" * 64))
    with pytest.raises(HTTPException):
        service.complete("alice", CompleteInput(state=state, browser_verifier="b" * 64))
    assert "expired" in service.callback(state, "code", "").headers["location"]
    stored = service.connection("alice")["payload"]
    assert "private-access" not in stored and "private-refresh" not in stored
    assert "private" not in json.dumps(service.status("alice"))
    assert not service.status("bob")["connected"]


def test_expiry_denial_and_missing_scope(service, monkeypatch):
    monkeypatch.setattr(service, "request", fake_google)
    state = begin(service)
    with service.engine.begin() as c:
        c.execute(text("UPDATE gmail_oauth SET expires=0"))
    assert "expired" in service.callback(state, "code", "").headers["location"]
    state = begin(service)
    assert "authorization" in service.callback(state, "", "access_denied").headers["location"]
    state = begin(service)
    monkeypatch.setattr(service, "request", lambda *a, **kw: {"access_token": "token", "refresh_token": "refresh", "scope": "wrong"})
    assert "authorization" in service.callback(state, "code", "").headers["location"]
    assert not service.status("alice")["connected"]


def test_sync_headers_only_paginates_deduplicates_and_never_changes_jobs(service, monkeypatch):
    connect(service, monkeypatch)
    jobs = [{"id": "job-1", "company": "Acme", "title": "Engineer", "stage": "Offer"}]
    calls = []
    def google(method, url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("/messages"):
            return {"messages": [{"id": "m1"}], "nextPageToken": "next"} if "pageToken" not in kwargs["params"] else {"messages": [{"id": "m1"}]}
        assert ("format", "metadata") in kwargs["params"]
        return {"internalDate": str(int(time.time()) * 1000), "payload": {"headers": [{"name": "Subject", "value": "Acme Engineer application received"}, {"name": "From", "value": "recruiting@acme.example"}]}, "snippet": "Must never be saved"}
    monkeypatch.setattr(service, "request", google)
    assert service.sync("alice", jobs)["has_more"]
    assert not service.sync("alice", jobs)["has_more"]
    assert len(service.status("alice")["messages"]) == 1
    message = service.status("alice")["messages"][0]
    assert message["job_ids"] == ["job-1"]
    assert message["suggested_stage"] == "Applied (Manual)"
    assert "snippet" not in message
    assert jobs[0]["stage"] == "Offer"
    assert not service.status("bob")["messages"]
    assert calls[2][1]["params"]["pageToken"] == "next"


def test_refresh_and_disconnect_failure_remove_local_data(service, monkeypatch):
    connect(service, monkeypatch)
    row = service.connection("alice")
    tokens = service.decrypt(row["payload"])
    tokens["expires"] = 0
    with service.engine.begin() as c:
        c.execute(text("UPDATE gmail_connections SET payload=:payload"), {"payload": service.encrypt(tokens)})
    calls = []
    def google(method, url, **kwargs):
        calls.append(url)
        if url.endswith("/token"):
            assert kwargs["data"]["grant_type"] == "refresh_token"
            return {"access_token": "new-access", "expires_in": 3600}
        return {"messages": []}
    monkeypatch.setattr(service, "request", google)
    service.sync("alice", [])
    assert any(url.endswith("/token") for url in calls)
    assert service.decrypt(service.connection("alice")["payload"])["access_token"] == "new-access"
    def unavailable(*args, **kwargs):
        raise HTTPException(502, "Unavailable")
    monkeypatch.setattr(service, "request", unavailable)
    result = service.disconnect("alice")
    assert not result["revoked"]
    assert service.connection("alice") is None


def test_disconnect_during_sync_does_not_restore_tokens(service, monkeypatch):
    connect(service, monkeypatch)
    def google(method, url, **kwargs):
        if url.endswith("/messages"):
            with service.engine.begin() as c:
                c.execute(text("DELETE FROM gmail_connections WHERE owner='alice'"))
            return {"messages": []}
        raise AssertionError(url)
    monkeypatch.setattr(service, "request", google)
    with pytest.raises(HTTPException):
        service.sync("alice", [])
    assert service.connection("alice") is None


def test_sync_lock_and_error_release(service, monkeypatch):
    connect(service, monkeypatch)
    with service.engine.begin() as c:
        c.execute(text("UPDATE gmail_connections SET lease=:lease"), {"lease": int(time.time()) + 300})
    with pytest.raises(HTTPException) as error:
        service.sync("alice", [])
    assert error.value.status_code == 429
    with service.engine.begin() as c:
        c.execute(text("UPDATE gmail_connections SET lease=0"))
    def unavailable(*args, **kwargs):
        raise HTTPException(502, "Unavailable")
    monkeypatch.setattr(service, "request", unavailable)
    with pytest.raises(HTTPException):
        service.sync("alice", [])
    assert service.connection("alice")["lease"] == 0
