"""Shared Postgres access (Neon on Vercel). Local dev and tests stay on files/SQLite."""

from __future__ import annotations

import os


def database_url() -> str | None:
    """The Postgres URL when the app runs against Neon (DATABASE_URL), else None."""
    url = (os.getenv("DATABASE_URL") or "").strip()
    return url or None


class PgConn:
    """Minimal sqlite3-like wrapper over psycopg: `?` placeholders, dict rows, commit on clean exit."""

    def __init__(self, url: str) -> None:
        import psycopg
        from psycopg.rows import dict_row

        self._conn = psycopg.connect(url, row_factory=dict_row)

    def execute(self, sql: str, params: tuple | list = ()):  # noqa: ANN201 - psycopg cursor
        return self._conn.execute(sql.replace("?", "%s"), params)

    def commit(self) -> None:
        self._conn.commit()

    def __enter__(self) -> "PgConn":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()
