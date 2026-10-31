from sqlalchemy.dialects.postgresql.psycopg import PGDialect_psycopg
from app.database import connection_url


def test_raw_password_reaches_driver_unchanged():
    password = 'Fictional1!@#%:/?+ secret'
    url = connection_url('postgresql://postgres.example@pooler.example.com:5432/postgres?sslmode=require', password)
    _, kwargs = PGDialect_psycopg().create_connect_args(url)
    assert url.drivername == 'postgresql+psycopg'
    assert kwargs['password'] == password
    assert kwargs['user'] == 'postgres.example'
    assert kwargs['sslmode'] == 'require'


def test_existing_encoded_url_and_sqlite_still_work():
    url = connection_url('postgresql+psycopg://postgres.example:Test%21%40@pooler.example.com/postgres')
    assert url.password == 'Test!@'
    assert connection_url('sqlite:///:memory:', 'unused').get_backend_name() == 'sqlite'
