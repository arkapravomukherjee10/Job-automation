"""Application-owned beta invitations; Supabase remains the identity provider."""

from dataclasses import dataclass
from datetime import datetime, timezone
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text

OWNER_EMAIL = "arkapravo.mukherjee10@gmail.com"


def normalize_email(email: str) -> str:
    return email.strip().casefold()


@dataclass(frozen=True)
class Identity:
    id: str
    email: str


class InvitationInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = normalize_email(value)
        if not re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+",
            value,
        ):
            raise ValueError("Enter a valid email address")
        return value


class AccessStore:
    def __init__(self, engine, postgres=False):
        self.engine = engine
        with engine.begin() as c:
            c.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS beta_invitations (email VARCHAR(254) PRIMARY KEY, active INTEGER NOT NULL, invited_by VARCHAR(100) NOT NULL, invited_at VARCHAR(40) NOT NULL, revoked_at VARCHAR(40))"
                )
            )
            c.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS beta_members (user_id VARCHAR(100) PRIMARY KEY, email VARCHAR(254) NOT NULL, signed_up_at VARCHAR(40) NOT NULL, last_seen_at VARCHAR(40) NOT NULL)"
                )
            )
            if postgres:
                for table in ["beta_invitations", "beta_members"]:
                    c.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
                    c.execute(text(f"REVOKE ALL ON {table} FROM anon, authenticated"))

    def seed_legacy(self, emails):
        # Import existing Render entries once; subsequent revocation stays effective.
        with self.engine.begin() as c:
            for email in emails:
                email = normalize_email(email)
                if not email or email == OWNER_EMAIL:
                    continue
                c.execute(
                    text(
                        "INSERT INTO beta_invitations (email, active, invited_by, invited_at) VALUES (:email, 1, :by, :now) ON CONFLICT (email) DO NOTHING"
                    ),
                    {
                        "email": email,
                        "by": "legacy-config",
                        "now": datetime.now(timezone.utc).isoformat(),
                    },
                )

    def allowed(self, identity):
        if identity.email == OWNER_EMAIL:
            return True
        with self.engine.connect() as c:
            return (
                c.execute(
                    text("SELECT active FROM beta_invitations WHERE email=:email"),
                    {"email": identity.email},
                ).scalar()
                == 1
            )

    def remember(self, identity):
        now = datetime.now(timezone.utc).isoformat()
        with self.engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO beta_members (user_id, email, signed_up_at, last_seen_at) VALUES (:id, :email, :now, :now) ON CONFLICT (user_id) DO UPDATE SET email=excluded.email, last_seen_at=excluded.last_seen_at"
                ),
                {"id": identity.id, "email": identity.email, "now": now},
            )

    def invite(self, email, actor):
        now = datetime.now(timezone.utc).isoformat()
        with self.engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO beta_invitations (email, active, invited_by, invited_at) VALUES (:email, 1, :by, :now) ON CONFLICT (email) DO UPDATE SET active=1, invited_by=excluded.invited_by, invited_at=excluded.invited_at, revoked_at=NULL"
                ),
                {"email": email, "by": actor, "now": now},
            )

    def revoke(self, email):
        with self.engine.begin() as c:
            return c.execute(
                text(
                    "UPDATE beta_invitations SET active=0, revoked_at=:now WHERE email=:email AND active=1"
                ),
                {"email": email, "now": datetime.now(timezone.utc).isoformat()},
            ).rowcount

    def dashboard(self):
        with self.engine.connect() as c:
            invitations = [
                dict(r)
                for r in c.execute(
                    text(
                        "SELECT email, active, invited_at, revoked_at FROM beta_invitations ORDER BY invited_at DESC"
                    )
                ).mappings()
            ]
            members = [
                dict(r)
                for r in c.execute(
                    text(
                        "SELECT email, signed_up_at, last_seen_at FROM beta_members ORDER BY signed_up_at DESC"
                    )
                ).mappings()
            ]
        active_emails = {r["email"] for r in invitations if r["active"]}
        signed_emails = {r["email"] for r in members}
        for r in invitations:
            r["active"] = bool(r["active"])
            r["signed_up"] = r["email"] in signed_emails
        for r in members:
            r["is_admin"] = r["email"] == OWNER_EMAIL
            r["allowed"] = r["is_admin"] or r["email"] in active_emails
        return {"invitations": invitations, "members": members}
