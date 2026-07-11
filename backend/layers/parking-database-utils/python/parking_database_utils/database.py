import os
from contextlib import contextmanager
from typing import Any, Iterable

import pymssql


def _config() -> dict:
    required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError("Faltan variables de base de datos: " + ", ".join(missing))
    return {
        "server": os.environ["DB_HOST"],
        "port": int(os.getenv("DB_PORT", "1433")),
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "database": os.environ["DB_NAME"],
        "login_timeout": int(os.getenv("DB_LOGIN_TIMEOUT", "10")),
        "timeout": int(os.getenv("DB_QUERY_TIMEOUT", "30")),
        "as_dict": True,
        "charset": "UTF-8",
    }


@contextmanager
def connection():
    conn = pymssql.connect(**_config())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_all(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, tuple(params))
            return list(cursor.fetchall())


def fetch_one(sql: str, params: Iterable[Any] = ()) -> dict | None:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, tuple(params))
            return cursor.fetchone()


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, tuple(params))
            return cursor.rowcount


def execute_insert(sql: str, params: Iterable[Any] = ()) -> int:
    statement = f"{sql}; SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(statement, tuple(params))
            row = cursor.fetchone()
            return int(row["id"])
