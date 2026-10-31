"""Build connection URLs with raw, separately supplied passwords."""
from sqlalchemy.engine import make_url


def connection_url(database_url: str, password: str | None = None):
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if password is not None and url.get_backend_name() == "postgresql":
        url = url.set(password=password)
    return url
