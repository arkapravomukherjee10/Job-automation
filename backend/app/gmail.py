"""Read-only Gmail connection. Secrets never leave the backend.

OAuth is finalized by the authenticated initiating browser, not by the public
callback. Sync stores headers only and never changes application stages.
"""
import base64
import hashlib
import json
import logging
import os
import re
import secrets
import time
from urllib.parse import urlencode, quote, urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
API = "https://gmail.googleapis.com/gmail/v1/users/me"


class OAuthLogFilter(logging.Filter):
    """Keep one-time OAuth codes/state out of Uvicorn request logs."""
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            if isinstance(args[2], str) and args[2].split("?", 1)[0] == "/api/gmail/callback":
                args[2] = "/api/gmail/callback"
                record.args = tuple(args)
        return True


logging.getLogger("uvicorn.access").addFilter(OAuthLogFilter())


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class ConnectInput(BaseModel):
    browser_verifier: str = Field(min_length=43, max_length=128)
    consent: bool


class CompleteInput(BaseModel):
    state: str = Field(min_length=32, max_length=128)
    browser_verifier: str = Field(min_length=43, max_length=128)


class GmailService:
    def __init__(self, engine, postgres=False):
        self.engine = engine
        with engine.begin() as c:
            c.execute(text("CREATE TABLE IF NOT EXISTS gmail_oauth (state VARCHAR(64) PRIMARY KEY, owner VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, verifier VARCHAR(64) NOT NULL, expires BIGINT NOT NULL, phase VARCHAR(20) NOT NULL, payload TEXT NOT NULL)"))
            c.execute(text("CREATE TABLE IF NOT EXISTS gmail_connections (owner VARCHAR(100) PRIMARY KEY, generation VARCHAR(64) NOT NULL, email VARCHAR(254) NOT NULL, payload TEXT NOT NULL, last_sync BIGINT NOT NULL DEFAULT 0, lease BIGINT NOT NULL DEFAULT 0, page TEXT NOT NULL DEFAULT '', query TEXT NOT NULL DEFAULT '')"))
            c.execute(text("CREATE TABLE IF NOT EXISTS gmail_messages (owner VARCHAR(100) NOT NULL, message_id VARCHAR(200) NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner, message_id))"))
            if postgres:
                for table in ("gmail_oauth", "gmail_connections", "gmail_messages"):
                    c.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
                    c.execute(text(f"REVOKE ALL ON {table} FROM anon, authenticated"))

    def config(self):
        values = {k: os.getenv(k, "") for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GMAIL_ENCRYPTION_SECRET")}
        frontend = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")[0].strip().rstrip("/")
        production = os.getenv("APP_MODE", "production") != "development"
        if not all(values.values()) or len(values["GMAIL_ENCRYPTION_SECRET"]) < 32:
            raise HTTPException(503, "Gmail connection is not configured yet")
        for address in (values["GOOGLE_REDIRECT_URI"], frontend):
            parsed = urlparse(address)
            if not parsed.netloc or parsed.fragment or parsed.query or (production and parsed.scheme != "https"):
                raise HTTPException(503, "Gmail connection configuration needs attention")
        return values, frontend

    def cipher(self):
        cfg, _ = self.config()
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(cfg["GMAIL_ENCRYPTION_SECRET"].encode()).digest()))

    def encrypt(self, data):
        return self.cipher().encrypt(json.dumps(data).encode()).decode()

    def decrypt(self, value):
        try:
            return json.loads(self.cipher().decrypt(value.encode()))
        except (InvalidToken, ValueError):
            raise HTTPException(409, "Stored Gmail connection cannot be opened. Disconnect and reconnect Gmail.")

    def request(self, method, url, **kwargs):
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                response = client.request(method, url, **kwargs)
            if response.status_code >= 400:
                if response.status_code in (400, 401):
                    raise HTTPException(409, "Google authorization expired or was declined. Reconnect Gmail.")
                raise HTTPException(502, "Google could not complete the request. Check Gmail access and try again.")
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError):
            raise HTTPException(502, "Google is temporarily unavailable. Please try again.")

    def connection(self, owner):
        with self.engine.connect() as c:
            row = c.execute(text("SELECT * FROM gmail_connections WHERE owner=:owner"), {"owner": owner}).mappings().first()
        return dict(row) if row else None

    def status(self, owner):
        try:
            self.config()
            available = True
        except HTTPException:
            available = False
        row = self.connection(owner)
        with self.engine.begin() as c:
            c.execute(text("DELETE FROM gmail_oauth WHERE expires<:now"), {"now": int(time.time())})
            messages = [json.loads(r) for r in c.execute(text("SELECT data FROM gmail_messages WHERE owner=:owner"), {"owner": owner}).scalars()]
        messages.sort(key=lambda m: m["received_at"], reverse=True)
        return {"available": available, "connected": bool(row), "email": row["email"] if row else None, "last_sync": row["last_sync"] if row else None, "has_more": bool(row and row["page"]), "messages": messages[:100]}

    def begin(self, identity, payload):
        cfg, _ = self.config()
        if not payload.consent:
            raise HTTPException(422, "Please confirm read-only Gmail access first")
        state, pkce = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        now = int(time.time())
        with self.engine.begin() as c:
            c.execute(text("DELETE FROM gmail_oauth WHERE expires < :now OR owner=:owner"), {"now": now, "owner": identity.id})
            c.execute(text("INSERT INTO gmail_oauth (state,owner,email,verifier,expires,phase,payload) VALUES (:state,:owner,:email,:verifier,:expires,'waiting',:payload)"), {"state": digest(state), "owner": identity.id, "email": identity.email, "verifier": digest(payload.browser_verifier), "expires": now + 600, "payload": self.encrypt({"pkce": pkce})})
        return {"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({"client_id": cfg["GOOGLE_CLIENT_ID"], "redirect_uri": cfg["GOOGLE_REDIRECT_URI"], "response_type": "code", "scope": SCOPE, "access_type": "offline", "prompt": "consent select_account", "state": state, "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(pkce.encode()).digest()).rstrip(b"=").decode(), "code_challenge_method": "S256"})}

    def callback(self, state, code, error):
        cfg, frontend = self.config()
        with self.engine.begin() as c:
            row = c.execute(text("UPDATE gmail_oauth SET phase='processing' WHERE state=:state AND expires>:now AND phase='waiting' RETURNING *"), {"state": digest(state), "now": int(time.time())}).mappings().first()
        if not row:
            return self.redirect(frontend, "error=expired")
        try:
            if error or not code:
                raise HTTPException(400, "Consent was not completed")
            pending = self.decrypt(row["payload"])
            tokens = self.request("POST", "https://oauth2.googleapis.com/token", data={"client_id": cfg["GOOGLE_CLIENT_ID"], "client_secret": cfg["GOOGLE_CLIENT_SECRET"], "code": code, "code_verifier": pending["pkce"], "grant_type": "authorization_code", "redirect_uri": cfg["GOOGLE_REDIRECT_URI"]})
            if SCOPE not in tokens.get("scope", "").split() or not tokens.get("refresh_token") or not tokens.get("access_token"):
                raise HTTPException(409, "Read-only access and offline consent are required")
            profile = self.request("GET", API + "/profile", headers={"Authorization": "Bearer " + tokens["access_token"]})
            email = profile.get("emailAddress", "").strip().casefold()
            if not email:
                raise HTTPException(502, "Could not verify mailbox")
            data = {"access_token": tokens["access_token"], "refresh_token": tokens["refresh_token"], "expires": int(time.time()) + int(tokens.get("expires_in", 3600)), "email": email}
            with self.engine.begin() as c:
                c.execute(text("UPDATE gmail_oauth SET phase='ready', payload=:payload WHERE state=:state AND phase='processing'"), {"state": digest(state), "payload": self.encrypt(data)})
            return self.redirect(frontend, "state=" + quote(state))
        except HTTPException:
            with self.engine.begin() as c:
                c.execute(text("DELETE FROM gmail_oauth WHERE state=:state"), {"state": digest(state)})
            return self.redirect(frontend, "error=authorization")

    @staticmethod
    def redirect(frontend, fragment):
        return RedirectResponse(frontend + "/#gmail_" + fragment, status_code=303, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    def complete(self, owner, payload):
        with self.engine.begin() as c:
            row = c.execute(text("DELETE FROM gmail_oauth WHERE state=:state AND owner=:owner AND verifier=:verifier AND phase='ready' AND expires>:now RETURNING payload"), {"state": digest(payload.state), "owner": owner, "verifier": digest(payload.browser_verifier), "now": int(time.time())}).scalar()
            if not row:
                raise HTTPException(400, "Connection expired or was started in another browser/account. Try connecting again.")
            data = self.decrypt(row)
            existing = c.execute(text("SELECT email FROM gmail_connections WHERE owner=:owner"), {"owner": owner}).scalar()
            if existing and existing != data["email"]:
                raise HTTPException(409, "Disconnect the current mailbox before connecting a different one.")
            c.execute(text("INSERT INTO gmail_connections (owner,generation,email,payload) VALUES (:owner,:generation,:email,:payload) ON CONFLICT (owner) DO UPDATE SET generation=excluded.generation,email=excluded.email,payload=excluded.payload,last_sync=0,lease=0,page='',query=''"), {"owner": owner, "generation": secrets.token_hex(16), "email": data["email"], "payload": row})
            c.execute(text("DELETE FROM gmail_messages WHERE owner=:owner"), {"owner": owner})
        return {"connected": True, "email": data["email"]}

    def disconnect(self, owner):
        row = self.connection(owner)
        revoked = True
        if row:
            try:
                data = self.decrypt(row["payload"])
                self.request("POST", "https://oauth2.googleapis.com/revoke", data={"token": data["refresh_token"]})
            except HTTPException:
                revoked = False
        with self.engine.begin() as c:
            for table in ("gmail_connections", "gmail_oauth", "gmail_messages"):
                c.execute(text(f"DELETE FROM {table} WHERE owner=:owner"), {"owner": owner})
        return {"disconnected": True, "revoked": revoked, "notice": "Gmail disconnected and imported email metadata removed." if revoked else "Gmail disconnected locally. Also remove Alongside access in your Google Account permissions; Google revocation could not be confirmed."}

    def sync(self, owner, jobs):
        started = time.monotonic()
        row = self.connection(owner)
        if not row:
            raise HTTPException(409, "Connect Gmail first")
        now = int(time.time())
        with self.engine.begin() as c:
            claimed = c.execute(text("UPDATE gmail_connections SET lease=:until WHERE owner=:owner AND generation=:generation AND lease<:now"), {"until": now + 120, "owner": owner, "generation": row["generation"], "now": now}).rowcount
        if not claimed:
            raise HTTPException(429, "A sync is already running. Please wait before trying again.")
        try:
            cfg, _ = self.config()
            data = self.decrypt(row["payload"])
            if data["expires"] < now + 60:
                refreshed = self.request("POST", "https://oauth2.googleapis.com/token", data={"client_id": cfg["GOOGLE_CLIENT_ID"], "client_secret": cfg["GOOGLE_CLIENT_SECRET"], "refresh_token": data["refresh_token"], "grant_type": "refresh_token"})
                if not refreshed.get("access_token"):
                    raise HTTPException(409, "Reconnect Gmail to refresh authorization")
                data.update(access_token=refreshed["access_token"], expires=now + int(refreshed.get("expires_in", 3600)))
            headers = {"Authorization": "Bearer " + data["access_token"]}
            query = row["query"] if row["page"] else f'after:{now - 30 * 86400} -in:spam -in:trash {{subject:application subject:applying subject:interview subject:offer subject:recruiting subject:candidacy}}'
            params = {"q": query, "maxResults": 10}
            if row["page"]:
                params["pageToken"] = row["page"]
            listing = self.request("GET", API + "/messages", headers=headers, params=params)
            messages = []
            for entry in listing.get("messages", []):
                if time.monotonic() - started > 45:
                    raise HTTPException(504, "Google took too long. Please retry this sync batch.")
                mid = entry["id"]
                message = self.request("GET", API + "/messages/" + quote(mid, safe=""), headers=headers, params=[("format", "metadata"), ("metadataHeaders", "Subject"), ("metadataHeaders", "From"), ("fields", "id,internalDate,payload/headers")])
                fields = {h["name"].lower(): h["value"] for h in message.get("payload", {}).get("headers", [])}
                subject, sender = fields.get("subject", "")[:500], fields.get("from", "")[:500]
                candidates = [j for j in jobs if j.get("company") and j.get("title") and re.search(r"(?<!\w)" + re.escape(j["company"].casefold()) + r"(?!\w)", (subject + " " + sender).casefold()) and j["title"].casefold() in subject.casefold()]
                messages.append({"id": mid, "subject": subject, "sender": sender, "received_at": int(message.get("internalDate", 0)), "job_ids": [j["id"] for j in candidates], "suggested_stage": suggest_stage(subject), "review_required": True})
            with self.engine.begin() as c:
                updated = c.execute(text("UPDATE gmail_connections SET payload=:payload,last_sync=:now,page=:page,query=:query WHERE owner=:owner AND generation=:generation"), {"payload": self.encrypt(data), "now": int(time.time()), "page": listing.get("nextPageToken", ""), "query": query, "owner": owner, "generation": row["generation"]}).rowcount
                if not updated:
                    raise HTTPException(409, "Gmail connection changed during sync")
                for message in messages:
                    c.execute(text("INSERT INTO gmail_messages (owner,message_id,data) VALUES (:owner,:mid,:data) ON CONFLICT (owner,message_id) DO NOTHING"), {"owner": owner, "mid": message["id"], "data": json.dumps(message)})
                # Keep the same 30-day window as the mailbox query.
                existing = c.execute(text("SELECT message_id,data FROM gmail_messages WHERE owner=:owner"), {"owner": owner}).all()
                for mid, saved in existing:
                    if json.loads(saved)["received_at"] < (now - 30 * 86400) * 1000:
                        c.execute(text("DELETE FROM gmail_messages WHERE owner=:owner AND message_id=:mid"), {"owner": owner, "mid": mid})
            return {"checked": len(messages), "has_more": bool(listing.get("nextPageToken")), "notice": "Email headers synced. Review suggestions; no application stages were changed."}
        finally:
            with self.engine.begin() as c:
                c.execute(text("UPDATE gmail_connections SET lease=0 WHERE owner=:owner AND generation=:generation"), {"owner": owner, "generation": row["generation"]})


def suggest_stage(subject):
    text_value = subject.casefold()
    if re.search(r"not selected|unsuccessful|not moving forward|application.*rejected", text_value):
        return "Rejected"
    if re.search(r"interview (invitation|scheduled)|invitation to interview", text_value):
        return "Interview"
    if re.search(r"offer of employment|job offer|employment offer", text_value):
        return "Offer"
    if re.search(r"application (received|submitted)|thank you for applying", text_value):
        return "Applied (Manual)"
    return None


def gmail_router(service, user, identity_dependency, get_jobs):
    router = APIRouter(prefix="/api/gmail")

    @router.get("/status")
    def status(owner=Depends(user)):
        return service.status(owner)

    @router.post("/connect")
    def connect(payload: ConnectInput, identity=Depends(identity_dependency), owner=Depends(user)):
        return service.begin(identity, payload)

    @router.get("/callback")
    def callback(state: str = "", code: str = "", error: str = ""):
        if not 32 <= len(state) <= 128 or len(code) > 4096:
            raise HTTPException(400, "Invalid Gmail callback")
        return service.callback(state, code, error)

    @router.post("/complete")
    def complete(payload: CompleteInput, owner=Depends(user)):
        return service.complete(owner, payload)

    @router.delete("/connection")
    def disconnect(owner=Depends(user)):
        return service.disconnect(owner)

    @router.post("/sync")
    def sync(owner=Depends(user)):
        return service.sync(owner, get_jobs(owner, "job"))

    return router
